// Prevents the Windows console host from opening for the desktop app.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
  app_lib::run();
}
