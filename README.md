# ESPHome VSCode plugin

This plugin provides validation, completion and hover help for ESPHome Yaml files.

![Plugin Preview](preview.gif)

## Configuration and usage

The plugin validates against ESPHome itself, so you will get the same errors. You can connect to ESPHome in two different ways:

1. Use the **ESPHome Dashboard**, this can be the ESPHome running in Home Assistant, in that case you will need to configure the add on to 'leave the front door open' and also give a tcp port in the addon for external access (in case you are only accessing via Ingress).

2. Use a **local installation of ESPHome**, if you can run esphome in your terminal, then you can use this option.

To select an option use VSCode built in settings editor and search for `ESPHome`. As this extension is under development for changes of these options to take effect you will have to reload VSCode window. If it doesn't seem to work try to reload VSCode window again.

Completion and hover help works with local data in the extension, so you will get this functionality even if the
connection with ESPHome is not made.

### Feedback

Please submit your issues to https://github.com/esphome/esphome-vscode/issues

## Contributing

For contributing check CONTRIBUTING.md
