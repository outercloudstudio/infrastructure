# Iteration notes

## Changes in this iteration (atomic, low-risk)
1. **Draft** (`draft.rs`): deterministic strong picks instead of random.
   Preferred order: Varg (splash), Ryth, Vendetta (reset-on-kill), Vesper Vale
   (gold bonus), Ren. Avoids the Cassi/Issac linked duo. Falls back to any free
   champion.
2. **Shop** (`bot.rs buy_items`): buy Monster Strength shards — the Monster
   emblem grants +15% camp damage (our main gem/gold source) and Strength adds
   basic-attack damage. Removed the random `chosen_stat` state.
3. **Abilities** (`cast_damage_on_camps`): cast a ready damaging/AoE spell on the
   nearest visible camp before falling back to basic attacks, for extra camp DPS.

## Known follow-ups (future iterations)
- Attack-reset combos: melee champs can reset + basic attack; not yet exploited.
- Buy an Altar Lock to protect our tribute / block the enemy.
- Weight camp targets by gem value / distance; prefer high-value respawned camps.
- Use CC (stuns) to survive camps and enemy champs.
- Consider buying a Home emblem for faster recall, Tribute emblem for faster banking.
- Shared memory: coordinate which altar/camps teammates target.
