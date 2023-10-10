# Changelog

## v2023.9.0 - 2023-10-09

- ↔ Sync with ESPHome v2023.9.3 Schema

## v2023.7.0 - 2023-07-23

- ↔ Sync with ESPHome v2023.7.0 Schema

## v2023.6.0 - 2023-06-23

- ↔ Sync with ESPHome v2023.6.0 Schema
- Minor fixes to support components schema oddities

## v2023.4.1 - 2023-05-05

- Update dependencies

## v2023.04.0 - 2023-05-01

- ↔ Sync with ESPHome v2023.04.0 Schema
- Fix output console showing up on every error

## v2022.11.0 - 2022-11-18

- ↔ Sync with ESPHome v2022.11.0 Schema

## v2022.10.0 - 2022-10-19

- ↔ Sync with ESPHome v2022.10.0 Schema
- Fix handling of tags for hover help e.g. !secret wrong docs
- Fix handling of included files with relative paths
- Improve autocomplete on lists when a - is already on the left of the cursor

## v2022.9.0 - 2022-09-26

- ↔ Sync with ESPHome v2022.9.0 Schema
- Fix docs not formatted in completions docs
- add homeassistant, component.update and other sensor actions
- A few other fixes

## v2022.8.3 - 2022-09-07

- 🆕 Sync with ESPHome v2022.8.3 Schema
- Fix completions not working properly on partial written keys
- Code clean up for sync with esphome-dashboard

## v2022.8.0

- 🆕 Sync with ESPHome v2022.8 Schema

## v2022.6.1

- Support dashboard running in https (@slovdahl)

## v2022.6.0

- 🆕 Sync with ESPHome v2022.6 Schema
- Adds completions on declared ids 😎 e.g. if you have a `light.tun_on:` action, the extension will suggest the compatible ids
- Adds goto definition (<kbd>F12</kbd> or ctrl-click on ids) 🌟
- Completion suggests `!lambda` on templatable properties
- Fix hover docs for `platform:` element
- Fix `scripts:` completions not working properly
- Don't try to validate secrets.yaml
- Adds lambda syntax 🌈 hilighting of C++
- Fix titles in See Also hovers

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
