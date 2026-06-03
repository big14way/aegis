// Binary entrypoint. The Aegis risk engine itself is the `cdylib` in `lib.rs`;
// this bin exists only so `cargo stylus` (export-abi + the reproducible-deploy
// constructor check) has a runnable target. Without `export-abi` it is `no_main`
// and compiles to nothing, leaving the wasm cdylib untouched.
#![cfg_attr(not(feature = "export-abi"), no_main)]

#[cfg(feature = "export-abi")]
fn main() {
    aegis_risk_engine::print_from_args();
}
