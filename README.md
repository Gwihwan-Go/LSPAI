# llm-lsp-ut README

This is the README for your extension "llm-lsp-ut". After writing up a brief description, we recommend including the following sections.

## Language Server SetUp

1. Install the language server by installing vscode extension.
2. Activate semantic tokenizer by adding the following to your settings.
   - Go language[[!gopls](https://github.com/golang/vscode-go/wiki/settings)] : add below to your settings.json, which can be accessed by pressing `Ctrl + ,` and then clicking on the `{}` icon on the top right corner.
	```json
    "gopls": {
		"ui.semanticTokens": true,
	}
    ```
    - Java language : add below to your settings.json, which can be accessed by pressing `Ctrl + ,` and then clicking on the `{}` icon on the top right corner.


## Requirements


If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
