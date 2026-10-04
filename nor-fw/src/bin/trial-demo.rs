use nor_fw::{
    flash::{Fixture, Flash},
    package::Package,
    trial, updater,
};
fn main() {
    let mut f = Flash::blank();
    updater::factory_provision(&mut f, 1, b"stable").unwrap();
    trial::install(
        &mut f,
        &Package::new(2, b"trial".to_vec()),
        &mut Fixture::default(),
    )
    .unwrap();
    for _ in 0..3 {
        f = Flash::from_image(f.image());
        println!(
            "{:?}",
            trial::next_boot(&mut f, &mut Fixture::default()).unwrap()
        );
    }
}
