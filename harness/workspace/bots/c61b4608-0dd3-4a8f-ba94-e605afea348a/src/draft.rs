use cambc::{ChampionDraft, Result, Team};

// Strong, deterministic early-game picks: durable melee bruisers with camp
// damage and resets, plus a ranged pick for gold. Avoid the linked duo.
const PREFERRED: [ChampionDraft; 5] = [
    ChampionDraft::Varg,
    ChampionDraft::Ryth,
    ChampionDraft::Vendetta,
    ChampionDraft::VesperVale,
    ChampionDraft::Ren,
];

pub fn play() -> Result<()> {
    let chosen = cambc::draft::current_draft(Team::Ally)?;
    // Prefer the best still-free pick; fall back to any that is available.
    let pick = PREFERRED.iter().copied().find(|p| !chosen.contains(p))
        .or_else(|| (0..11).filter_map(|i| ChampionDraft::try_from(i).ok())
            .find(|p| !chosen.contains(p)))
        .expect("a champion is always available in the draft");
    // Draft memory is copied to each champion later.
    cambc::draft_memory().submit(b"hello world")?;
    cambc::draft::pick(pick)
}
