# Changelog

## v2022.5.0

Seems like I have skipped some release notes, anyway:

- Brand new implementation, without the YAML language server, now more detailed analysis can be done.
- Now using version in sync with ESPHome, during beta time of ESPHome there might be a pre release version available
- Fixed an issue where effects autocomplete were not listed on some lights

## v.0.22.0 - 2021-07-29

- Sync schema with ESPHome v1.20.2 (fix)

## v.0.21.0 - 2021-07-29

- Sync schema with ESPHome v1.20.2

## v.0.20.0 - 2021-07-2

- Use user environment variables (@definitio)
- Fix compiling on case-sensitive file systems (@definitio)

## v.0.19.0 - 2021-06-30

- Republish due to packaging issue

## v.0.18.0 - 2021-06-17

- Fixes due to change in ESPHome command line format

## v.0.17.0 - 2021-05-26

- Update schema
  - Fix `script:`, `api: services` and `interval:` completion/hover help
  - Fix recursive pin definition

## v.0.16.0 - 2021-05-16

- Update schema

## v.0.15.0 - 2021-05-16

- Bump yaml-language-server to v0.19.0
- Removed LSP webpack

## v.0.14.0 - 2021-05-14

- Update schema
- Fix using wrong paths for validation

## v.0.13.0 - 2021-03-18

- Update Schema add some enums

## v.0.12.0 - 2021-03-11

- Update Schema add pins and filters

## v.0.11.0 - 2021-03-09

- Revert yaml language server update

## v.0.10.0 - 2021-03-09

- Update yaml language server
- Fix schema missing docs

## v.0.9.0 - 2021-03-08

- Update schema

## v.0.8.0 - 2021-03-07

- Fix ESPHome validator local might not validate UTF-8 characters under Windows.ls

## v.0.6.0 - 2021-03-03

- Fix handle unexpected responses when using ESPHome local

## v.0.5.0 - 2021-02-27

- Fix validating multi documents
- Fix handling ESPHome errors crashed connection

## v.0.4.0 - 2021-02-23

- Add hover and completion 🧉
- Converted to LSP architecture
- Fix error message string interpolation 💊

## v.0.3.0 - 2020-06-09

- Improved icon
- Add OTA task for active file

## v.0.2.0

- Initial release

## v.0.1.0

- Preview release
