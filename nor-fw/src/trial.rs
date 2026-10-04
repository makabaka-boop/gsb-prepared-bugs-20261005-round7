//! Persistent trial/confirmation policy, separate from publication records.
use crate::{
    boot,
    flash::{ErasePattern, Fixture, Flash, NorError, Phase},
    layout::{self, slot_base, RecFields, SECTOR_SIZE},
    package::Package,
    sha256::sha256,
    updater,
};
const BASE: usize = layout::REC_BASE + 2 * SECTOR_SIZE;
const SIZE: usize = 256;
const CAP: usize = SECTOR_SIZE / SIZE;
const MAGIC: &[u8; 8] = b"TRIAL003";
const COMMIT: &[u8; 8] = b"TRLCMMT!";
#[derive(Clone, Debug)]
pub struct State {
    pub sequence: u64,
    pub phase: u8,
    pub attempts: u8,
    pub stable: RecFields,
    pub candidate: RecFields,
    pub max_version: u32,
    pub token: u64,
}
#[derive(Clone, Debug)]
pub struct Boot {
    pub firmware: RecFields,
    pub trial: bool,
    pub token: Option<u64>,
}
fn rejected(message: &str) -> NorError {
    NorError::Rejected(message.into())
}
fn fields(b: &[u8]) -> RecFields {
    RecFields {
        seq: u64::from_be_bytes(b[8..16].try_into().unwrap()),
        slot: b[16],
        version: u32::from_be_bytes(b[17..21].try_into().unwrap()),
        data_len: u32::from_be_bytes(b[21..25].try_into().unwrap()),
        fw_hash: b[32..64].try_into().unwrap(),
    }
}
fn encode(s: &State) -> [u8; SIZE] {
    let mut b = [255; SIZE];
    b[..8].copy_from_slice(MAGIC);
    b[8..16].copy_from_slice(&s.sequence.to_be_bytes());
    b[16] = s.phase;
    b[17] = s.attempts;
    b[20..24].copy_from_slice(&s.max_version.to_be_bytes());
    b[24..32].copy_from_slice(&s.token.to_be_bytes());
    b[32..96].copy_from_slice(&layout::encode_record(&s.stable)[..64]);
    b[96..160].copy_from_slice(&layout::encode_record(&s.candidate)[..64]);
    let h = sha256(&b[..216]);
    b[216..248].copy_from_slice(&h);
    b[248..].copy_from_slice(COMMIT);
    b
}
fn scan(flash: &Flash) -> Option<(State, usize)> {
    let mut best = None;
    for i in 0..2 * CAP {
        let b = flash.read(BASE + i * SIZE, SIZE);
        if &b[..8] != MAGIC || &b[248..] != COMMIT || sha256(&b[..216]) != b[216..248] {
            continue;
        }
        let s = State {
            sequence: u64::from_be_bytes(b[8..16].try_into().unwrap()),
            phase: b[16],
            attempts: b[17],
            max_version: u32::from_be_bytes(b[20..24].try_into().unwrap()),
            token: u64::from_be_bytes(b[24..32].try_into().unwrap()),
            stable: fields(&b[32..96]),
            candidate: fields(&b[96..160]),
        };
        if s.stable.slot > 1
            || s.candidate.slot > 1
            || !(1..=3).contains(&s.phase)
            || s.attempts > 2
        {
            continue;
        }
        if best
            .as_ref()
            .map(|(v, _): &(State, usize)| v.sequence < s.sequence)
            .unwrap_or(true)
        {
            best = Some((s, i));
        }
    }
    best
}
pub fn inspect(flash: &Flash) -> Option<State> {
    scan(flash).map(|x| x.0)
}
fn valid(flash: &Flash, r: &RecFields) -> bool {
    r.slot < 2
        && r.data_len > 0
        && r.data_len as usize <= layout::SLOT_SIZE
        && sha256(flash.read(slot_base(r.slot), r.data_len as usize)) == r.fw_hash
}
fn published(flash: &Flash, r: &RecFields) -> bool {
    boot::inspect(flash)
        .candidates
        .iter()
        .any(|c| c.fields == *r)
        && valid(flash, r)
}
fn initial(flash: &Flash) -> Result<RecFields, NorError> {
    let r = boot::inspect(flash);
    let c = r.chosen.ok_or_else(|| rejected("No stable firmware"))?;
    r.candidates
        .into_iter()
        .find(|v| v.fields.seq == c.seq && v.fields.slot == c.slot)
        .map(|v| v.fields)
        .ok_or_else(|| rejected("No stable record"))
}
fn append(flash: &mut Flash, mut s: State, fx: &mut Fixture) -> Result<State, NorError> {
    let previous = scan(flash);
    s.sequence = previous.as_ref().map(|v| v.0.sequence + 1).unwrap_or(1);
    let active = previous.as_ref().map(|v| v.1 / CAP).unwrap_or(0);
    let free = (active * CAP..(active + 1) * CAP)
        .find(|i| flash.read(BASE + i * SIZE, SIZE).iter().all(|v| *v == 255));
    let dest = if let Some(i) = free {
        i
    } else {
        let next = 1 - active;
        flash.erase_sector(BASE / SECTOR_SIZE + next, fx, ErasePattern::Clean)?;
        next * CAP
    };
    if dest / CAP != active {
        flash.erase_sector(BASE / SECTOR_SIZE + active, fx, ErasePattern::Clean)?;
    }
    flash.program_record_item(BASE + dest * SIZE, &encode(&s), Phase::TrialState, fx)?;
    if dest / CAP != active {
        fx.enter_phase(Phase::TrialReclaim);
        flash.erase_sector(BASE / SECTOR_SIZE + active, fx, ErasePattern::Clean)?;
    }
    Ok(s)
}
pub fn install(flash: &mut Flash, pkg: &Package, fx: &mut Fixture) -> Result<State, NorError> {
    let old = inspect(flash);
    if old
        .as_ref()
        .map(|s| s.phase == 1 && published(flash, &s.candidate))
        .unwrap_or(false)
    {
        return Err(rejected("Trial still pending"));
    }
    let stable = old
        .as_ref()
        .map(|s| s.stable.clone())
        .unwrap_or(initial(flash)?);
    if !valid(flash, &stable) {
        return Err(rejected("Stable firmware is unavailable"));
    }
    let max = old
        .as_ref()
        .map(|s| s.max_version)
        .unwrap_or(stable.version);
    if pkg.version <= max || pkg.data.is_empty() {
        return Err(rejected("Invalid version or empty image"));
    }
    updater::precheck(flash, pkg).map_err(NorError::Rejected)?;
    let sequence = boot::inspect(flash)
        .candidates
        .iter()
        .map(|c| c.fields.seq)
        .max()
        .unwrap_or(0)
        + 1;
    let candidate = RecFields {
        seq: sequence,
        slot: 1 - stable.slot,
        version: pkg.version,
        data_len: pkg.data.len() as u32,
        fw_hash: pkg.hash,
    };
    let intent = State {
        sequence: 0,
        phase: 1,
        attempts: 0,
        stable: stable.clone(),
        candidate,
        max_version: pkg.version,
        token: 0,
    };
    let state = append(flash, intent, fx)?;
    updater::run_update(flash, pkg, fx)?;
    Ok(state)
}
pub fn next_boot(flash: &mut Flash, fx: &mut Fixture) -> Result<Boot, NorError> {
    let Some(mut s) = inspect(flash) else {
        return Ok(Boot {
            firmware: initial(flash)?,
            trial: false,
            token: None,
        });
    };
    if s.phase == 1 && published(flash, &s.candidate) {
        s.token = s.sequence + 1;
        return Ok(Boot {
            firmware: s.candidate,
            trial: true,
            token: Some(s.token),
        });
    }
    if !valid(flash, &s.stable) {
        return Err(rejected("Stable firmware damaged"));
    }
    if s.phase == 1 {
        s.phase = 3;
        s.token = 0;
        s = append(flash, s, fx)?;
    }
    Ok(Boot {
        firmware: s.stable,
        trial: false,
        token: None,
    })
}
pub fn confirm(
    flash: &mut Flash,
    firmware: &RecFields,
    token: u64,
    fx: &mut Fixture,
) -> Result<(), NorError> {
    let mut s = inspect(flash).ok_or_else(|| rejected("No trial"))?;
    if s.candidate.version != firmware.version || token == 0 || !published(flash, firmware) {
        return Err(rejected("Confirmation is stale or foreign"));
    }
    if s.phase == 2 {
        return Ok(());
    }
    if s.phase != 1 {
        return Err(rejected("No running trial"));
    }
    s.stable = s.candidate.clone();
    s.phase = 2;
    append(flash, s, fx)?;
    Ok(())
}
