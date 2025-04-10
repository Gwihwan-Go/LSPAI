import * as vscode from 'vscode';
import { generateUnitTestForSelectedRange, showDiffAndAllowSelection } from './generate';
import { Configuration, getConfigInstance } from './config';
import { collectTrainData, main } from './train/collectTrainData';
import * as fs from 'fs';
import path from 'path';
import { getCodeAction } from './diagnostic';
import { generateUnitTestsForFocalMethod, init, signIn, copilotServer } from './copilot';
import { GenerationType, PromptType, FixType } from './config';
import { extractSymbolDocumentMapFromTaskList, loadAllTargetSymbolsFromWorkspace, saveTaskList } from './helper';
import { experimentWithCopilot } from './copilot';
import { generateTimestampString } from './fileHandler';
import { TelemetryService } from './telemetry/telemetryService';

export async function activate(context: vscode.ExtensionContext) {

	const telemetry = TelemetryService.initialize(context);
    
    // Check for consent
    await telemetry.ensurePrivacyConsent();

    // Example usage in your existing code
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.generateUnitTest', async () => {
            try {
                // Your existing code
                telemetry.logEvent('generateUnitTest', {
                    success: true,
                    duration: 1000,
                    // other relevant data
                });
            } catch (error) {
                telemetry.logError(error as Error, {
                    command: 'generateUnitTest',
                    // other relevant error context
                });
            }
        })
    );
	
	const workspace = vscode.workspace.workspaceFolders;

	if (!Configuration.isTestingEnvironment() && workspace && workspace.length > 0) {	
		console.log(`Workspace: ${workspace[0].uri.fsPath}`);
		getConfigInstance().updateConfig({
			workspace: workspace[0].uri.fsPath
		});
	} else {
		console.log(`No workspace found`);
	}
	console.log(`Model: ${getConfigInstance().model}`);
	console.log(`Methods: ${getConfigInstance().methodsForExperiment}`);
	console.log(`Max Rounds: ${getConfigInstance().maxRound}`);
	console.log(`EXP_PROB_TO_TEST: ${getConfigInstance().expProb}`);
	console.log(`PARALLEL: ${getConfigInstance().parallelCount}`);

	// ... existing code ...
    // const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'untitled' }, {
    //     provideHover(document, position, token) {
    //         // Check if this is one of our test documents
    //         // Implementation logic for test documents
            
    //         const lastLineNumber = document.lineCount - 1;
            
    //         // Hover for Accept button
    //         if (position.line === lastLineNumber && position.character >= document.lineAt(lastLineNumber).text.length) {
    //             return new vscode.Hover('Accept these changes');
    //         } 
    //         // Hover for Reject button
    //         else if (position.line === lastLineNumber + 1 && position.character <= 8) {
    //             return new vscode.Hover('Reject these changes and close the document');
    //         }
            
    //         return null;
    //     }
    // });
    // context.subscriptions.push(hoverProvider);
    // Handle user interaction
    const acceptCommand = vscode.commands.registerCommand('extension.acceptChanges', async () => {
        const originalEditor = vscode.window.activeTextEditor;
        if (originalEditor) {
            await originalEditor.edit(editBuilder => {
                editBuilder.replace(new vscode.Range(0, 0, originalEditor.document.lineCount, 0), 'accepted');
            });
            vscode.window.showInformationMessage('Changes accepted.');
        }
    });

    const rejectCommand = vscode.commands.registerCommand('extension.rejectChanges', () => {
        vscode.window.showInformationMessage('Changes rejected.');
		
    });
	// Add commands to the context
	context.subscriptions.push(acceptCommand, rejectCommand);
	// Clean up the selection change listener when done
	// const disposable = vscode.workspace.onDidCloseTextDocument((doc) => {
	// 	if (doc === untitledDocument) {
	// 		acceptCommand.dispose();
	// 		rejectCommand.dispose();
	// 		vscode.commands.executeCommand('setContext', 'extension.showAcceptReject', false);
	// 		// Close the document
	// 		vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	// 	}
	// });
	const copilotExperimentDisposable = vscode.commands.registerCommand('lspAi.CopilotExperiment', async () => {
		const language = "go";
		let taskListPath = "";

		// if (language === "java") {
		//  Since Java project's symbol providers are not consistent.
		// 	const projectName = getConfigInstance().workspace.split("/").pop();
		// 	taskListPath = `/LSPAI/experiments/data/${projectName}/taskList.json`;
		// 	console.log(`taskListPath: ${taskListPath}`);
		// }

		try {
		// Show progress indicator
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Running Copilot Experiment...",
			cancellable: false
		}, async (progress) => {
			// Initialize Copilot connection
			const connection = await copilotServer();
			await init(connection, getConfigInstance().workspace);
			await signIn(connection);
	
			// Load symbols from workspace
			getConfigInstance().updateConfig({
			generationType: GenerationType.AGENT,
			fixType: FixType.GROUPED,
			promptType: PromptType.DETAILED,
			expProb: 1,
			savePath: path.join(
				getConfigInstance().workspace, 
				`results_copilot_${getConfigInstance().generationType}_${getConfigInstance().promptType}_${generateTimestampString()}`,
				getConfigInstance().model
			)
			});

			let symbolDocumentMaps = await loadAllTargetSymbolsFromWorkspace(language);
			if (taskListPath) {
				console.log(`from current ${symbolDocumentMaps.length} symbolDocumentMaps,  symbols will be used.`);
				symbolDocumentMaps = await extractSymbolDocumentMapFromTaskList(
					getConfigInstance().workspace,
					symbolDocumentMaps,
					taskListPath
				);
				console.log(`after extracting, ${symbolDocumentMaps.length} symbolDocumentMaps will be used.`);
			}
			await saveTaskList(symbolDocumentMaps, getConfigInstance().workspace, getConfigInstance().savePath);
			// Update config for the experiment
	
			// Run the experiment
			const results = await experimentWithCopilot(
			connection,
			symbolDocumentMaps,
			vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
			0
			);
	
			vscode.window.showInformationMessage('Copilot experiment completed successfully!');
		});
		} catch (error) {
		vscode.window.showErrorMessage(`Failed to run Copilot experiment: ${error}`);
		}
	});
	
	context.subscriptions.push(copilotExperimentDisposable);

	const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255,255,0,0.3)', // Light yellow background
        border: '1px solid yellow'
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.showInlineSuggestion', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10)); // Example range
                const decoration = { range, hoverMessage: 'Suggested change: ...' };
                editor.setDecorations(decorationType, [decoration]);
            }
        })
    );
  // ... existing code ...

	const diagnosticDisposable = vscode.commands.registerCommand('extension.diagnostic', async () => {

		const newContent = `package org.apache.commons.cli;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class TypeHandler_getConverter_3_1Test {
    
    private TypeHandler typeHandler;
    private Map<Class<?>, Converter<?, ?>> converterMap;

    @BeforeEach
    public void setUp() {
        converterMap = new HashMap<>();
        // Check how TypeHandler should be initialized. This assumes there's a method to register converters.
        typeHandler = new TypeHandler(); // Update this line based on available constructors or factory methods.
        
        // If TypeHandler requires setting the converter map some other way, do that here instead.
        // For example, if there's a method like typeHandler.setConverterMap(converterMap);
    }
    
    @Test
    public void testGetConverter_WithRegisteredConverter() {
        Converter<String, ?> customConverter = mock(Converter.class);
        converterMap.put(String.class, customConverter);
        
        Converter<String, ?> resultConverter = typeHandler.getConverter(String.class);
        
        assertEquals(customConverter, resultConverter);
    }

    @Test
    public void testGetConverter_WithNullConverter() {
        Converter<String, ?> resultConverter = typeHandler.getConverter(String.class);
        
        assertEquals(Converter.DEFAULT, resultConverter);
    }

    @Test
    public void testGetConverter_WithIntegerClass() {
        Converter<Integer, ?> customConverter = mock(Converter.class);
        converterMap.put(Integer.class, customConverter);
        
        Converter<Integer, ?> resultConverter = typeHandler.getConverter(Integer.class);
        
        assertEquals(customConverter, resultConverter);
    }
    
    @Test
    public void testGetConverter_WithFloatingPointClass() {
        Converter<Double, ?> customConverter = mock(Converter.class);
        converterMap.put(Double.class, customConverter);
        
        Converter<Double, ?> resultConverter = typeHandler.getConverter(Double.class);
        
        assertEquals(customConverter, resultConverter);
    }
    
    @Test
    public void testGetConverter_WithBooleanClass() {
        Converter<Boolean, ?> customConverter = mock(Converter.class);
        converterMap.put(Boolean.class, customConverter);
        
        Converter<Boolean, ?> resultConverter = typeHandler.getConverter(Boolean.class);
        
        assertEquals(customConverter, resultConverter);
    }
    
    @Test
    public void testGetConverter_WithUnsupportedType() {
        Converter<Object, ?> resultConverter = typeHandler.getConverter(Object.class);
        
        assertEquals(Converter.DEFAULT, resultConverter);
    }

    // Commenting out the reflective test until the method existence is verified
    /*
    @Test
    public void testGetConverter_WithPrivateMethodReflection() throws Exception {
        Method privateMethod = TypeHandler.class.getDeclaredMethod("somePrivateMethod", String.class);
        privateMethod.setAccessible(true);
        privateMethod.invoke(typeHandler, "argument");

        // Assuming some behavior changes or side effects from private method invocation that can be tested after
    }
    */
}`;
		await showDiffAndAllowSelection(newContent, 'java');
		// const editor = vscode.window.activeTextEditor;
		// if (!editor) {
		// 	vscode.window.showErrorMessage('Please open a file and select a function to generate unit test.');
		// 	return;
		// }
		
		// // const filepath = "/LSPAI/experiments/projects/commons-csv/src/test/java/org/apache/commons/csv/CSVFormat_getIgnoreEmptyLines1Test.java";
		// // const uri = vscode.Uri.file(filepath);
		// const document = editor.document;
		// const diagnostics = await vscode.languages.getDiagnostics(document.uri);
		// const codeActions = await getCodeAction(document.uri, diagnostics[0]);
		// for (const diagnostic of diagnostics) {
		// 	console.log('diagnostics', diagnostics);
		// 	const codeActions = await getCodeAction(editor.document.uri, diagnostic);
			
		// 	// Filter for quick fix actions only
		// 	const quickFixes = codeActions.filter(action => 
		// 		action.kind && action.kind.contains(vscode.CodeActionKind.QuickFix)
		// 	);
	
		// 	// Apply each quick fix
		// 	for (const fix of quickFixes) {
		// 		console.log('fix', fix);
		// 		if (fix.edit) {
		// 			// Double check we're only modifying the target file
		// 			const edits = fix.edit.entries();
		// 			const isTargetFileOnly = edits.every(([uri]) => uri.fsPath === 	document.uri.fsPath);
					
		// 			if (isTargetFileOnly) {
		// 				await vscode.workspace.applyEdit(fix.edit);
		// 			}
		// 		}
		// 	}
		// }
	});
	
	const disposable = vscode.commands.registerCommand('extension.generateUnitTest', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('Please open a file and select a function to generate unit test.');
			return;
		}

		telemetry.logEvent('generateUnitTest', {
			success: true,
			duration: 1000,
			// other relevant data
		});
		try {
			const testCode = await generateUnitTestForSelectedRange(editor.document, editor.selection.active);
			if (testCode) {
				// Create a new untitled document with the generated code
				const newDocument = await vscode.workspace.openTextDocument({
					language: editor.document.languageId,
					content: testCode
				});
				await vscode.window.showTextDocument(newDocument, { preview: true });
				vscode.window.showInformationMessage('Unit test generated successfully!');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to generate unit test: ${error}`);
		}
	});
	
	context.subscriptions.push(disposable);

	// const disposable_exp = await vscode.commands.registerCommand('lspAi.JavaExperiment', async () => {
	// 	vscode.window.showInformationMessage('LSPAI:JavaExperiment!');
	// 	const language = "java";
	// 	await experiment(language, getConfigInstance().methodsForExperiment);
	// 	// Handle results...
	// });
	// context.subscriptions.push(disposable_exp);

	// const disposable2 = await vscode.commands.registerCommand('lspAi.GoExperiment', async () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	const language = "go";
	// 	await experiment(language, getConfigInstance().methodsForExperiment);
	// });
	// context.subscriptions.push(disposable2);

	// const Pydisposable2 = await vscode.commands.registerCommand('lspAi.PythonExperiment', async () => {
	// 	const language = "python";
	// 	await experiment(language, getConfigInstance().methodsForExperiment);
	// });

	// context.subscriptions.push(Pydisposable2);

	// const disposable4 = await vscode.commands.registerCommand('lspAi.ReExperiment', async () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	const language = "java";
	// 	const currentGenMethods = ["deepseek-reasoner"];
	// 	const currentTestPath = `/LSPAI/experiments/projects/commons-cli/results_2_26_2025__11_45_35`;
	// 	// inspect whether the currentTestPath is endswith any of currentGenMethod
	// 	const isModelSynced = currentGenMethods.some(method => method.endsWith(getConfigInstance().model));
	// 	if (!isModelSynced) {
	// 		vscode.window.showErrorMessage('Current Model Setting is not correct.');
	// 		return;
	// 	}
	// 	const isEndsWith = currentGenMethods.some(method => currentTestPath.endsWith(method));
	// 	if (isEndsWith) {
	// 		vscode.window.showErrorMessage('The current test path should not end gen methods.');
	// 		return;
	// 	}

	// 	await reExperiment(language, currentGenMethods, currentTestPath);
	// });

	// context.subscriptions.push(disposable4);

	const collectTrainDataDisposable = await vscode.commands.registerCommand('lspAi.CollectTrainData', async () => {
		// const dataFolder = path.join(__dirname, '../data');
		const dataFolder = "/UniTSyn/data/focal";

		const jsonlFiles = fs.readdirSync(dataFolder)
		.filter(file => file.endsWith('.jsonl'))
		.map(file => path.join(dataFolder, file));
		for (const jsonlFile of jsonlFiles) {	
			console.log("jsonlFile: ", jsonlFile);
			const inputJsonPath = jsonlFile;
			const outputJsonPath = "/LSPAI/temp/" + jsonlFile.split('/').pop();
			if (fs.existsSync(outputJsonPath)) {
				fs.unlinkSync(outputJsonPath);
			}
	// Call the main function
	const result = await main(inputJsonPath, outputJsonPath);
	
	console.log(outputJsonPath);

			// Assert that the result is not null or undefined

		}
	});
	context.subscriptions.push(collectTrainDataDisposable);

	const showSettingsDisposable = vscode.commands.registerCommand('lspAi.showSettings', () => {
		const settings = [
			`Model: ${getConfigInstance().model}`,
			`Methods: ${getConfigInstance().methodsForExperiment}`,
			`Max Rounds: ${getConfigInstance().maxRound}`,
			`Experiment Probability: ${getConfigInstance().expProb}`,
			`Parallel Count: ${getConfigInstance().parallelCount}`,
			`Timeout: ${getConfigInstance().timeoutMs}`
		];
		
		vscode.window.showInformationMessage('Current Settings:', {
			detail: settings.join('\n'),
			modal: true
		});
	});
	context.subscriptions.push(showSettingsDisposable);
}
export function deactivate() { }