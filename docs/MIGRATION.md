# Moving from the original DeskThing

DeskThing Community is a separate application. It does not install over the
original DeskThing and never writes to the original's data.

## What happens on first launch

1. DeskThing Community uses its own profile directory, `deskthing-community`,
   inside the operating system's application-data folder (`%APPDATA%` on Windows).
2. If that profile holds no data and an original profile (`deskthing`) exists,
   the user data is copied across: settings, installed apps and their data,
   mappings, profiles, known devices, the device client, and the machine ID.
3. Browser caches, logs, and downloaded firmware (`flash/`) are not copied.
4. The result is recorded in `legacy-import.json`. The import never runs again
   once that file exists.

Entries are copied to a staging directory and moved into place only after every
copy has succeeded. A failed import is undone and reported on the loading
screen; the app then starts with an empty profile.

## What it does not do

- It does not uninstall the original, change its autostart entry, or stop it.
  Both applications use the same ports, so quit the original before starting
  DeskThing Community and remove it (or disable its autostart) once satisfied.
  Uninstalling the original keeps its data by default.
- It does not merge. A profile that already holds data is never overwritten.
- Changes made in the original after the import are not picked up.

`deskthing://` links are kept so existing apps continue to work. Whichever of
the two applications was started most recently handles them.

## Going back

Quit DeskThing Community and start the original. Its profile is unchanged.

## Importing again

Quit DeskThing Community, delete the `deskthing-community` profile directory,
and start it again. This discards everything done in DeskThing Community.

## Damaged or unversioned data

If `settings.json` is missing or unreadable while other data exists, the data is
moved to `recovery/unversioned-<timestamp>/` inside the profile rather than
deleted, and the app starts clean.
