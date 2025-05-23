import * as vscode from 'vscode';
import { getContextTermsFromTokens, getTokensInPaths } from '../../tokenAnalyzer';
import { SupportedLanguage } from '../../ast';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { Path, PathCollector } from '../../cfg/path';
import { getContextSelectorInstance, ContextTerm } from '../../agents/contextSelector';
import { getConfigInstance, PromptType } from '../../config';
import { parseCode } from '../../utils';
import { BaseTestGenerator } from '../base';
import { findTemplateFile, generateTestWithContext, loadPathTestTemplate } from '../../prompts/promptBuilder';
import { LLMLogs } from '../../log';
import { invokeLLM } from '../../invokeLLM';
import { ChatMessage } from '../../prompts/ChatMessage';
import { getPackageStatement, getImportStatement } from '../../retrieve';
import { LanguageTemplateManager } from '../../prompts/languageTemplateManager';
import { error } from 'console';
import { DecodedToken } from '../../token';
import { readTxtFile } from '../../fileHandler';


export async function generateTestWithContextWithCFG(
    document: vscode.TextDocument,
    functionSymbol: vscode.DocumentSymbol,
    source_code: string, 
    context_info: ContextTerm[], 
    paths: any[],
    fileName: string,
    template?: { system_prompt: string, user_prompt: string }
): Promise<ChatMessage[]> {
    const result = [];
    let context_info_str = "";
    for (const item of context_info) {
        if (item.need_definition && item.context && item.context!=item.name) {
            result.push(`\n#### Definition of ${item.name}\n${item.context}`);
        }
        if (item.need_example && item.example && item.example!=item.name) {
            result.push(`\n#### Example of ${item.name}\n${item.example}`);
        }
    }
    if (result.length > 0) {
        context_info_str = result.join('\n');
    }
    const packageStatement = getPackageStatement(document, document.languageId);
    const importString = getImportStatement(document, document.languageId, functionSymbol);
    let systemPrompt = await readTxtFile(findTemplateFile("lspaiSystem.txt"));
    let userPrompt = await readTxtFile(findTemplateFile("lspaiUser.txt"));
    let example = await readTxtFile(findTemplateFile("example1.txt"));
    // const prompts = template || loadPathTestTemplate();
    
    // if filname contains /, remove it

    // const systemPrompt = prompts.system_prompt;
    // let userPrompt = prompts.user_prompt;
    const pathsWithIndex = paths.map((p, index) => `${index+1}. ${p.simple}`).join('\n')
    // Replace variables in the user prompt
    userPrompt = userPrompt
        .replace('{focal_method}', source_code)
        .replace('{conditions}', pathsWithIndex)
        .replace('{context}', context_info_str)
        .replace('{test_format}', LanguageTemplateManager.getUnitTestTemplate(
            document.languageId,
            fileName,
            packageStatement ? packageStatement[0] : "",
            importString,
            []
        ));
    systemPrompt = systemPrompt
        .replace('{example}', example);
    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
}

export class CFGTestGenerator extends BaseTestGenerator {
    async generateTest(): Promise<string> {
        const functionText = this.document.getText(this.functionSymbol.range);
        
        // Build CFG
        const cfgBuildingStartTime = Date.now();
        const builder = createCFGBuilder(this.languageId as SupportedLanguage);
        const cfg = await builder.buildFromCode(functionText);
        this.logger.log("buildCFG", (Date.now() - cfgBuildingStartTime).toString(), null, "");
        
        // Collect paths
        const pathCollectorStartTime = Date.now();
        const pathCollector = new PathCollector(this.languageId);
        const paths = pathCollector.collect(cfg.entry);
        const minimizedPaths = pathCollector.minimizePaths(paths);
        const uniqueConditions = pathCollector.getUniqueConditions();
        this.logger.log("collectCFGPaths", (Date.now() - pathCollectorStartTime).toString(), null, "");
        this.logger.saveCFGPaths(functionText, minimizedPaths);
        
        // Gather context if needed
        let enrichedTerms;
        if (getConfigInstance().promptType === PromptType.WITHCONTEXT) {
            enrichedTerms = await this.collectInfo(uniqueConditions);
			if (enrichedTerms === null) {
				return "";
			}
        }

        // Generate test
        // const promptObj = paths.length > 1 
        //     ? generateTestWithContextWithCFG(this.document, this.functionSymbol, functionText, enrichedTerms, paths, this.fileName)
        //     : generateTestWithContext(this.document, functionText, enrichedTerms, this.fileName);
        const generationStartTime = Date.now();
        const promptObj = await generateTestWithContextWithCFG(this.document, this.functionSymbol, functionText, enrichedTerms!, minimizedPaths, this.fileName)
            // : generateTestWithContext(this.document, functionText, enrichedTerms, this.fileName);
        const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model};
        const testCode = await invokeLLM(promptObj, logObj);
        this.logger.log("generateTest", (Date.now() - generationStartTime).toString(), logObj, "");
        return parseCode(testCode);
    }
}