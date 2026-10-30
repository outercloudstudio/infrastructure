use axum::{
    Router, extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State}, response::Response, routing::get,
};
use tokio::sync::mpsc;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use futures_util::{SinkExt, StreamExt};
use uuid::Uuid;

use crate::Args;

struct ProxyState {
    message_queues: HashMap<Uuid, Arc<Mutex<Vec<Vec<u8>>>>>
}

async fn handle_expose_tcp_listener(address: SocketAddr, state: Arc<Mutex<ProxyState>>) {

}

async fn handle_expose_socket(socket: WebSocket, state: Arc<Mutex<ProxyState>>) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let id = Uuid::new_v4();
    let message_queue: Arc<Mutex<Vec<Vec<u8>>>> = Arc::new(Mutex::new(Vec::new()));

    {
        let mut state = state.lock().unwrap();
        state.message_queues.insert(id, message_queue.clone());
    };

    let send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if sender.send(message).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(message)) = receiver.next().await {
        match &message {
            Message::Binary(bytes) => {
                let data: &[u8] = bytes.as_ref();

                println!("binary: {} bytes", data.len());

                if data.len() < 16 {
                    break;
                }

                let tcp_addr = SocketAddr::from(([0, 0, 0, 0], 25569));
                tokio::spawn(handle_expose_tcp_listener(tcp_addr, state.clone()));

                {
                    let state = state.lock().unwrap();

                    let other_id = Uuid::from_bytes(data[0..16].try_into().unwrap());

                    println!("Other id: {}", other_id);

                    match state.message_queues.get(&other_id) {
                        Some(message_queue) => {
                            let mut message_queue = message_queue.lock().unwrap();
                            message_queue.push(data.to_vec());
                        },
                        None => {
                            println!("Received message for id {} that does not exist!", other_id);

                            break;
                        }
                    }
                };
            }
            Message::Text(_) => break,
            Message::Close(_) => break,
            _ => {}
        }

        // let _ = tx.send(message);
    }


    state.lock().unwrap().message_queues.remove(&id);

    send_task.abort();
}

async fn expose(ws: WebSocketUpgrade, State(state): State<Arc<Mutex<ProxyState>>>) -> Response {
    return ws.on_upgrade(move |socket| handle_expose_socket(socket, state));
}

pub async fn serve(args: &Args) {
    let proxy_state: Arc<Mutex<ProxyState>> = Arc::new(Mutex::new(ProxyState {
        message_queues: HashMap::new(),
    }));

    let app = Router::new()
        .route("/expose", get(expose))
        .with_state(proxy_state);

    let port: u16 = args.port.unwrap_or(25568);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    axum_server::bind(addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

pub async fn join(args: &Args) {

}