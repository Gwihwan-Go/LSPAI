# LSPAI README

This is the README for your extension "LSPAI". After writing up a brief description, we recommend including the following sections.

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

## Dependency Setting

1. Manual settings
    - Java Code Coverage Collect
        1. First, compile the target project, and locate compiled .class files under target/classes directory.
            - git clone
            - navigate to the root directory
            - mvn install -DskipTests
            - install dependency libs : mvn dependency:copy-dependencies
            - check whether the compiled .class files generated under ${workspace}/target/classes ( for example, /commons-cli/target/classes/org/**/*.class)
        2. Run the LSPAI
            - F5 and run Extension Development Host
            - clike File -> open Folder -> open commons-cli
            - Cntrl+Shift+P
            - Type "Java Experiment", and Run the "Java Experiment"
            - You can check out that the experiment is ongoing on Debug Console.
        3. Run the pre-built script `java_coverage.bash` with giving the root directory of the target project and save directory of generated unit tests.
        ```bash
        bash java_coverage.bash /vscode-llm-ut/experiments/commons-cli /vscode-llm-ut/temp/results_12_22_2024__20_46_22/naive_gpt-4o-mini
        ```
    - Go Coverage Collect
        1. First, compile the target project
            - git clone
            - go build
        2. Run the LSPAI
            - same with above --> "Go Experiment"
        3. Run the pre-built script
        ```bash
go build -o target/coverage_reporter coverage_reporter.go
target/coverage_reporter -target /vscode-llm-ut/experiments/logrus -test /vscode-llm-ut/experiments/logrus/tests -report /vscode-llm-ut/experiments/logrus/reports/
        ```
    - Python Coverage Collect
    0. install coverage collecting libs `apt install python3-coverage python3-pytest`
        1. First prepare all libs to be downloading
            For black,
            ```bash
            apt install python3-myst-parser
            apt install python3-Sphinx python3-docutils python3-sphinxcontrib-programoutput==0.18
            apt install python3-Sphinx python3-docutils python3-sphinxcontrib-programoutput python3-sphinx_copybutton python3-furo
            apt install python3-Sphinx
            apt install python3-click python3-mypy-extensions
            apt-get install python3-pathspec python3-platformdirs
            ```
        2. Fix minor error
            - create _black_version.py file under src/black. 

        3. run pre-written coverage collect script.
If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

1. Missing X server or $DISPLAY
```bash
[356101:1225/002335.748682:ERROR:ozone_platform_x11.cc(245)] Missing X server or $DISPLAY
[356101:1225/002335.748705:ERROR:env.cc(258)] The platform failed to initialize.  Exiting.
```
run the command with `xvfb-run`.


## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of LSAPI.

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
