import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as ini from 'ini';
import { invokeLLM } from '../invokeLLM';
import { DecodedToken, getDecodedTokensFromSybol, countUniqueDefinitions, getTokensFromStr } from '../token';
import { retrieveDef } from '../retrieve';
import { getReferenceInfo } from '../reference';
import { getSymbolDetail, formatToJSON, extractArrayFromJSON } from '../utils';
import { getAllSymbols } from '../lsp';
import { activate, getSymbolByLocation } from '../lsp';
import { clear } from 'console';
import { ContextSelectorConfig, findTemplateFile } from '../prompts/promptBuilder';
import { getConfigInstance } from '../config';
export interface ContextTerm {
    name: string;
    context?: string; // Optional context once retrieved
    example?: string; // Optional example once retrieved
    need_example?: boolean; // Whether the term needs example code
    need_definition?: boolean; // Whether the term needs context
    token?: DecodedToken;
    need_full_definition?: boolean; // Whether the term needs full definition
    hint?: string[]; // hint for the term
}


// export function contextToString(contextTerms: ContextTerm[]): string {
//     const result = [];
//     let context_info_str = "";
//     for (const item of contextTerms) {
//         const relativePath = path.relative(getConfigInstance().workspace, item.token!.definition[0].uri.path);
//         if (item.need_definition && item.context && item.context!=item.name) {
//             result.push(`\n#### Definition of ${item.name}\n${item.context}`);
//         }
//         if (item.need_example && item.example && item.example!=item.name) {
//             result.push(`\n#### Example of ${item.name}\n${item.example}`);
//         }
//     }
//     if (result.length > 0) {
//         context_info_str = result.join('\n');
//     }
//     return context_info_str;
// }
export function contextToString(contextTerms: ContextTerm[]): string {
    const result = [];
    let context_info_str = "";
    for (const item of contextTerms) {
        const relativePath = path.relative(getConfigInstance().workspace, item.token!.definition[0].uri.path);
        if (item.need_definition && item.context && item.context!=item.name) {
            result.push(`\n# ${relativePath}\n${item.context}`);
        }
        if (item.need_example && item.example && item.example!=item.name) {
            result.push(`\n# ${relativePath}\n${item.example}`);
        }
    }
    if (result.length > 0) {
        context_info_str = result.join('\n');
    }
    return context_info_str;
}

export class ContextSelector {
    private static instance: ContextSelector;
    private config: ContextSelectorConfig;
    private document: vscode.TextDocument;
    private tokens: DecodedToken[] = [];
    private targetSymbol: vscode.DocumentSymbol;

    private constructor(document: vscode.TextDocument, targetSymbol: vscode.DocumentSymbol) {
        this.config = this.loadConfig();
        this.document = document;
        this.targetSymbol = targetSymbol;
    }
    // Move all async initialization logic here
    private async initialize(): Promise<void> {
        await this.getAllTokens();
        // Any other async initialization
    }
    public static async create(document: vscode.TextDocument, targetSymbol: vscode.DocumentSymbol): Promise<ContextSelector> {
        const instance = new ContextSelector(document, targetSymbol);
        await instance.initialize(); // Call async initialization here
        return instance;
    }
    public static async getInstance(document: vscode.TextDocument, targetSymbol: vscode.DocumentSymbol): Promise<ContextSelector> {
        if (!ContextSelector.instance) {
            ContextSelector.instance = await ContextSelector.create(document, targetSymbol);
        }
        return ContextSelector.instance;
    }

    public getTokens(): DecodedToken[] {
        return this.tokens;
    }

    private async getAllTokens(): Promise<DecodedToken[]> {
        const decodedTokens = await getDecodedTokensFromSybol(this.document, this.targetSymbol);
        this.tokens = decodedTokens;
        return decodedTokens;
    }
    /**
     * Loads configuration from the .ini file
     */
    private loadConfig(): ContextSelectorConfig {
        try {
            const configPath = findTemplateFile("contextSelector.ini");
            const configData = fs.readFileSync(configPath, 'utf8');
            return ini.parse(configData) as ContextSelectorConfig;
        } catch (error) {
            console.error('Error loading config, using defaults:', error);
            // Return default configuration if file can't be loaded
            return {
                general: {
                    max_terms: 5,
                    relevance_threshold: 0.6
                },
                prompts: {
                    identify_terms_system: "You are an expert code analyzer that identifies terms that need additional context for unit test generation. Focus on functions, classes, dependencies, and complex logic.",
                    identify_terms_user: "Analyze the following code and identify the top {max_terms} most important terms, functions, or concepts that would require additional context to write effective unit tests:\n\n{source_code}",
                    test_generation_user: "Focal method and its source code to test:\n\n{source_code}. Important terms' context information:\n\n{context_info}",
                    test_generation_system: "You are an expert software engineer specializing in unit testing. Your task is to generate comprehensive and effective unit tests that maximize coverage of the given focal methods. Analyze the provided focal method and ensure the generated tests cover as many lines as possible. Use the important terms or source codes as references to align with expected behavior. Follow the unit test format strictly, as provided. Ensure edge cases, boundary values, and possible failure points are tested. The test structure must be clean, maintainable, and efficient. Only output Code which wrapped by ```, and do not include any other text.",
                    test_inspection_system: "System prompt for test inspection",
                    test_inspection_user: "User prompt for test inspection"
                }
            };
        }
    }
    
    /**
     * Reloads configuration from the .ini file
     */
    public reloadConfig(): void {
        this.config = this.loadConfig();
    }
    
    public needKeyTermFilter(tokens: DecodedToken[] | null = null): boolean {
        let curTokens = tokens;
        if (!curTokens) {
            curTokens = this.tokens
        }
        // const uniqueDefinitions = countUniqueDefinitions(curTokens);
        // if (uniqueDefinitions > this.config.general.max_terms) {
        //     return true;
        // }
        const uniqueTokens = new Set(curTokens.map(token => token.word));
        if (uniqueTokens.size > this.config.general.max_terms) {
            return true;
        }
        console.log("needKeyTermFilter: the number of unique definitions is ", uniqueTokens.size, "Therefore we don't need to filter");
        return false;
    }

    /**
     * Analyzes code to identify terms that need context for test generation
     * @param sourceCode The source code to analyze
     * @returns Array of terms that should be looked up for additional context
     */
    public async identifyContextTerms(sourceCode: string, logObj: any): Promise<ContextTerm[]> {
        // if (!this.needKeyTermFilter()) {
        //     return [];
        // }
        // Prepare prompt using the template from config
        const systemPrompt = this.config.prompts.identify_terms_system.replace('{max_terms}', this.config.general.max_terms.toString());
        const userPrompt = this.config.prompts.identify_terms_user
            .replace('{source_code}', sourceCode);
        
        const promptObj = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];
        
        try {
            console.log("promptObj", JSON.stringify(promptObj, null, 2));
            const response = await invokeLLM(promptObj, logObj);
            console.log("response", JSON.stringify(response, null, 2));
            return this.parseContextTermsFromResponse(response);
        } catch (error) {
            console.error('Error identifying context terms:', error);
            return [];
        }
    }

    public async identifyContextTermsWithCFG(sourceCode: string, tokens: string[], logObj: any): Promise<ContextTerm[]> {
        // const includedTokens = this.tokens.filter(token => tokens.includes(token.word));
        // if (!this.needKeyTermFilter(includedTokens)) {
        //     return [];
        // }
        // Prepare prompt using the template from config
        const systemPrompt = this.config.prompts.identify_terms_system.replace('{max_terms}', this.config.general.max_terms.toString());
        const userPrompt = this.config.prompts.identify_terms_user
            .replace('{source_code}', sourceCode);
        
        const promptObj = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];
        
        try {
            console.log("promptObj", JSON.stringify(promptObj, null, 2));
            const response = await invokeLLM(promptObj, logObj);
            console.log("response", JSON.stringify(response, null, 2));
            return this.parseContextTermsFromResponse(response);
        } catch (error) {
            console.error('Error identifying context terms:', error);
            return [];
        }
    }

    /**
     * Parses LLM response to extract context terms
     * Handles JSON format and falls back to regex if needed
     */
    public parseContextTermsFromResponse(response: string): ContextTerm[] {

        const result: ContextTerm[] = [];
        const jsonContent = formatToJSON(response);
        const jsonArray = extractArrayFromJSON(jsonContent);
        for (const term of jsonArray) {
            console.log("name", term);
            const termWithoutArgs = term.name.replace(/\(.*?\)/g, ''); // Remove argument parts
            const methodName = termWithoutArgs.split('.').pop();
            for (const token of this.tokens) {
                if (token.word === methodName) {
                    result.push({
                        name: token.word,
                        need_definition: term.need_definition,
                        need_example: term.need_example,
                        context: "",
                        example: "",
                    });
                    break;
                }
            }
        }
        return result;
}
    
    /**
     * Retrieves context for identified terms
     * @param terms Array of terms to get context for
     * @param codebase Optional codebase information to help with context gathering
     * @returns The same terms with description fields populated
     */
    public async gatherContext(terms: ContextTerm[], functionSymbol: vscode.DocumentSymbol | null): Promise<ContextTerm[]> {
        const logObj: any = {};
        const enrichedTerms: ContextTerm[] = [];
        console.log("document", this.document.uri.fsPath);
        // console.log("tokens", this.tokens);
        console.log("targetTerms", this.targetSymbol);
        for (const term of terms) {
            // Prepare prompt using the template from config
            // find the symbol of term in AllTokens 
            const targetToken = this.tokens.find(token => token.word === term.name);
            let enriched = false;
            if (targetToken) {
                const currentToken = await retrieveDef(this.document, targetToken);
                // const symbols = await getAllSymbols(this.document.uri);
                // const isDefUnderFocalMethod = isDefUnderFocalMethod(currentToken, functionSymbol);
                if (!currentToken.definition || !currentToken.definition[0] || !currentToken.definition[0].uri) {
                    console.log(`No definition found for "${JSON.stringify(term)}"`);
                    continue;
                }
                if (isInWorkspace(currentToken.definition[0].uri)) {

                    if (currentToken.definition && currentToken.definition[0].range && currentToken.definition.length > 0) {
                            const defSymbolDoc = await vscode.workspace.openTextDocument(currentToken.definition[0].uri);
                            if (term.need_example) {
                                if (currentToken.definition[0].range) {
                                    term.example = await getReferenceInfo(defSymbolDoc, currentToken.definition[0].range, 20);
                                    enriched = true;
                                }
                             }
                            if (term.need_definition) {
                                if (currentToken.definition[0].range && !isBetweenFocalMethod(currentToken.definition[0].range, functionSymbol)) {
                                    if (currentToken.type == 'variable' || currentToken.type == 'property') {
                                        // Some tokens don't have to find symbol, directly recall its definition
                                        const defSymbolDoc = await vscode.workspace.openTextDocument(currentToken.definition[0].uri);
                                        term.context = defSymbolDoc.lineAt(currentToken.definition[0].range.start.line).text.trim();
                                        if (this.document.getText(this.targetSymbol.range).includes(term.context)) {
                                            // we don't need to find the definition of the term if it is in the source code
                                            term.context = "";
                                        } else {
                                            enriched = true;
                                        }
                                    } else {    
                                        // fir method, functions, we need first find out its symbol to recall its definition
                                        if (currentToken.defSymbol === null){
                                            currentToken.defSymbol = await getSymbolByLocation(defSymbolDoc, currentToken.definition[0].range.start);
                                        }
                                        if (currentToken.defSymbol && currentToken.defSymbol !== functionSymbol) {
                                            // if need_full_definition is not defined => false, defined && value is true => true, defined && value is false => false
                                            const needFullDefinition = term.need_full_definition === undefined ? false : term.need_full_definition;
                                            term.context = await getSymbolDetail(defSymbolDoc, currentToken.defSymbol, needFullDefinition);
                                            enriched = true;
                                            }
                                    }
                            }
                        }
                    } else {
                        console.log(`No definition found for "${JSON.stringify(term)}"`);
                        continue;
                    }
                } else {
                    console.log(`word ${term.name} is out of workspace`);
                    continue;
                }
                if (enriched) {
                    enrichedTerms.push(term);
                    // continue;
                } else {
                    console.log(`No context found for "${JSON.stringify(term)}"`);
                }
            }
        }
        return enrichedTerms;
    }
    
}

/**
 * Checks if a token's definition is located between the start and end lines of a focal method
 * @param tokenRange The range of the token's definition
 * @param focalMethodSymbol The symbol representing the focal method
 * @returns true if the token's definition is between the focal method's lines, false otherwise
 */
function isBetweenFocalMethod(
    tokenRange: vscode.Range,
    focalMethodSymbol: vscode.DocumentSymbol | null
): boolean {
    if (!focalMethodSymbol) {
        return false;
    }

    return (
        tokenRange.start.line > focalMethodSymbol.range.start.line && 
        tokenRange.end.line < focalMethodSymbol.range.end.line
    );
}

// Export a convenience function to get the singleton instance
export async function getContextSelectorInstance(document: vscode.TextDocument, targetSymbol: vscode.DocumentSymbol): Promise<ContextSelector> {
    return await ContextSelector.getInstance(document, targetSymbol);
}

function isInWorkspace(uri: vscode.Uri): boolean {
    return uri.fsPath.includes(getConfigInstance().workspace);
}