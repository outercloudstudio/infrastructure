use tokio;
use clap::{Parser, ValueEnum};

mod proxy;

#[derive(Clone, Copy, Debug, ValueEnum)]
enum Mode {
    ServeProxy,
    JoinProxy,
}

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    mode: Mode,
    port: Option<u16>,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    match args.mode {
        Mode::ServeProxy => proxy::serve(&args).await,
        Mode::JoinProxy => proxy::join(&args).await,
    };
}