// Champion decisions. main.rs dispatches here after the draft.
use cambc::{
    Bitboard, CampGroup, Champion,
    DistanceField, ItemType as Item, Result, Team, Unit, Vec2,
};
use std::ops::Deref;

fn me() -> Result<&'static Champion> {
    Ok(cambc::self_champion()?.expect("play starts after the draft"))
}

fn distance(a: Vec2, b: Vec2) -> i32 {
    a.chebyshev_distance(b) as i32
}

fn tiles_around(position: Vec2, radius: i32) -> Result<Bitboard> {
    let mut tiles = Bitboard::new()?;
    tiles.draw_chebyshev(position, radius as f32)?;
    Ok(tiles)
}

fn blocked_tiles() -> Result<Bitboard> {
    // Combine terrain and visible occupants using native bitboard operations.
    let mut blocked = cambc::map::walls()?.clone();
    for mask in [cambc::map::holes()?.clone(), cambc::map::altars()?.clone(),
        cambc::map::spawn_region(Team::Enemy)?.clone(), cambc::vision::champion_tiles(None)?,
        cambc::vision::camp_tiles()?, cambc::vision::teleport_tiles()?] {
        blocked.union_assign(&mask)?;
    }
    blocked.set(me()?.position()?, false)?;
    Ok(blocked)
}

fn move_towards_closest(mut goals: Bitboard) -> Result<bool> {
    let me = me()?;
    let origin = me.position()?;
    if !me.can_move()? || goals.is_set(origin)? { return Ok(false); }

    let blocked = blocked_tiles()?;
    goals.intersect_assign(&blocked.complement()?.union(&cambc::vision::camp_tiles()?)?)?;
    if goals.is_empty()? { return Ok(false); }
    if goals.count()? == 1 && !blocked.is_set(goals.positions()?[0])? {
        return me.move_towards(goals.positions()?[0]);
    }

    let mut field = DistanceField::new()?;
    field.compute_to(&blocked.intersect(&goals.complement()?)?, &goals, &tiles_around(origin, 0)?, &mut Bitboard::new()?, DistanceField::UNREACHABLE)?;

    let mut step = origin;
    for tile in blocked.reachable_tiles(origin, me.base_stats()?.base_move_speed as u16)?.positions()? {
        if field.get(tile)? < field.get(step)? { step = tile; }
    }
    if step == origin { Ok(false) } else { me.move_absolute(step) }
}

// Compute the attack mask once, rather than once per visible target.
fn attack_first_in_range<T: Deref<Target = Unit>>(targets: &[T]) -> Result<bool> {
    let me = me()?;
    if targets.is_empty() || !me.can_attack()? { return Ok(false); }
    let attack_tiles = me.attack_tiles()?;
    for target in targets {
        if target.is_visible()? && attack_tiles.is_set(target.position()?)? && target.health()? > 0.0 {
            me.attack(target.deref())?;
            return Ok(true);
        }
    }
    Ok(false)
}

// Nearest visible, living camp tile, for spell targeting.
fn nearest_camp_pos() -> Result<Option<Vec2>> {
    let camps = cambc::vision::camps()?;
    if camps.is_empty() { return Ok(None); }
    let origin = me()?.position()?;
    let mut nearest = None;
    let mut best = i64::MAX;
    for camp in &camps {
        if !camp.is_visible()? || camp.health()? <= 0.0 { continue; }
        let p = camp.position()?;
        let d = origin.chebyshev_distance(p);
        if d < best { best = d; nearest = Some(p); }
    }
    Ok(nearest)
}

// Use a ready damaging spell on the nearest visible camp. Damage spells target
// the unit; AoE damage spells target the ground at the camp's tile.
fn cast_damage_on_camps() -> Result<bool> {
    let me = me()?;
    if !me.can_cast()? { return Ok(false); }
    let Some(tpos) = nearest_camp_pos()? else { return Ok(false) };
    let origin = me.position()?;

    for ability in me.abilities() {
        if !ability.is_damage() && !ability.is_aoe_damage() { continue; }
        if !ability.is_ready()? { continue; }
        // valid_tiles is the ability's range mask around us; skip out-of-range.
        if !ability.valid_tiles()?.is_set(tpos)? { continue; }

        if ability.can_target_ground()? {
            if ability.cast_at(tpos)? { return Ok(true); }
        }
        if ability.can_target_enemies()? || ability.can_target_camps()? {
            for camp in cambc::vision::camps()? {
                if camp.is_visible()? && camp.position()? == tpos && camp.health()? > 0.0 {
                    if ability.cast_on(&camp)? { return Ok(true); }
                    break;
                }
            }
        }
    }
    Ok(false)
}

// A unit that can hit us from our current tile. Recall is a 5-turn channel
// interrupted by any damage, so starting one while threatened bleeds us out.
fn threatened() -> Result<bool> {
    let me = me()?;
    let origin = me.position()?;
    let atk = me.attack_tiles()?;
    for champ in cambc::vision::champions(Some(Team::Enemy))? {
        if champ.is_visible()? && atk.is_set(champ.position()?)? { return Ok(true); }
    }
    for camp in cambc::vision::camps()? {
        if camp.is_visible()? && camp.health()? > 0.0 && camp.attack_tiles()?.is_set(origin)? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn farm_camps(bot: &mut Bot) -> Result<()> {
    // Attack a camp already in range, otherwise move toward the nearest camp tiles.
    if attack_first_in_range(&cambc::vision::camps()?)? { return Ok(()); }

    // Cache fixed spawn locations; only visible respawn state changes each turn.
    if bot.camp_layout.is_none() {
        let mut tiles = Bitboard::new()?;
        let mut groups = Vec::new();
        for group in cambc::map::camp_groups()? {
            let spawns = group.spawn_tiles()?;
            tiles.union_assign(&spawns)?;
            groups.push((group, spawns));
        }
        bot.camp_layout = Some((tiles, groups));
    }
    let (spawns, groups) = bot.camp_layout.as_ref().unwrap();
    let mut goals = spawns.clone();
    let visible = cambc::vision::visible_tiles()?;
    for (group, tiles) in groups {
        if !tiles.intersect(&visible)?.is_empty()?
            && matches!(group.state()?, cambc::CampGroupState::Respawning(_)) {
            goals.intersect_assign(&tiles.complement()?)?;
        }
    }

    if move_towards_closest(goals)? {
        attack_first_in_range(&cambc::vision::camps()?)?;
    }
    Ok(())
}

// Per-champion state survives between turns.
#[derive(Default)]
pub struct Bot {
    camp_layout: Option<(Bitboard, Vec<(CampGroup, Bitboard)>)>,
}

impl Bot {
    fn buy_items(&self) -> Result<()> {
        // Spend on camp damage: the Monster emblem multiplies damage to camps,
        // our main gold/gem source, and strength shards add basic-attack dmg.
        let me = me()?;
        let item = Item::MonsterShardOfStrength;
        let count = me.gold_count()? / item.cost()?;
        if count > 0 && me.can_buy(item, count)? { me.buy_count(item, count)?; }
        Ok(())
    }

    pub fn play_turn(&mut self) -> Result<()> {
        // Read before writing: little-endian u32 at shared-memory byte offset zero.
        let mut bytes = [0; 4];
        cambc::shared_memory().read(0, &mut bytes)?;
        println!("shared round: {}", u32::from_le_bytes(bytes));
        cambc::shared_memory().write(0, &cambc::round_number()?.to_le_bytes())?;

        // Priorities: shop and recall, attack enemies in range, bank gems, then farm.
        let me = me()?;
        if !me.is_alive()? || me.is_recalling()? || me.is_submitting_gems()? || me.is_teleporting()?
            || (!me.can_move()? && !me.can_attack()?) { return Ok(()); }

        let at_spawn = cambc::map::spawn_region(Team::Ally)?.is_set(me.position()?)?;
        if at_spawn { self.buy_items()?; }

        // Recall is a channel interrupted by damage; only start it where nothing
        // can hit us, otherwise we get hit, lose the channel, and bleed out.
        if !at_spawn && !threatened()? && me.health()? < me.max_health()? * 0.35 {
            me.recall()?;
            return Ok(());
        }

        if attack_first_in_range(&cambc::vision::champions(Some(Team::Enemy))?)? { return Ok(()); }

        if me.gem_count()? > 0 {
            // Union all altar approach tiles: the field chooses the nearest reachable altar.
            let mut goals = Bitboard::new()?;
            for altar in cambc::map::altars()?.positions()? {
                if cambc::vision::has_altar_lock(altar)? { continue; }
                let range = cambc::constants().submit_gems_range;
                if distance(me.position()?, altar) <= range { me.submit_gems(altar)?; return Ok(()); }
                goals.union_assign(&tiles_around(altar, range)?)?;
            }
            move_towards_closest(goals)?;
            return Ok(());
        }

        // Farm: use a damaging spell when in range, otherwise attack or move closer.
        if cast_damage_on_camps()? { return Ok(()); }
        farm_camps(self)?;

        cambc::self_champion()?.expect("gameplay champion").set_priority(1 + crate::random_number(100) as i32)
    }
}
