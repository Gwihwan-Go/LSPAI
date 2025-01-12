// fileHandler.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Uri, WorkspaceEdit, workspace } from 'vscode';
import * as vscode from 'vscode';
import { getPackageStatement, summarizeClass } from './retrieve';
import { getLanguageSuffix } from './language';

export function writeCodeToTempFile(code: string, extension: string = 'ts'): string {
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `fix_${Date.now()}.${extension}`);
    fs.writeFileSync(tempFilePath, code, { encoding: 'utf-8' });
    return tempFilePath;
}

export async function updateOriginalFile(filePath: string, newCode: string): Promise<void> {
    const edit = new WorkspaceEdit();
    const uri = vscode.Uri.file(filePath);
    const document = await workspace.openTextDocument(uri);
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );
    edit.replace(uri, fullRange, newCode);
    await workspace.applyEdit(edit);
}

export async function saveGeneratedCodeToFolder(code: string, fileName: string): Promise<void> {
	const folderPath = path.dirname(fileName);
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}

	fs.writeFileSync(fileName, code, 'utf8');
	console.log(`Generated code saved to ${fileName}`);
}

export async function saveGeneratedCodeToIntermediateLocation(code: string, fullfileName: string, folderName: string): Promise<string> {
    const fullPath = path.join(folderName, fullfileName);
	const folderPath = path.dirname(fullPath);
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}
    fs.writeFileSync(fullPath, code, 'utf8');
    console.log(`Generated code saved to ${fullPath}`);
    return fullPath;
}

export function findFiles(folderPath: string, Files: string[] = [], language:string, suffix:string) {
    fs.readdirSync(folderPath).forEach(file => {
        const fullPath = path.join(folderPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            findFiles(fullPath, Files, language, suffix); // Recursively search in subdirectory
        } else if (file.endsWith(`.${suffix}`)) {
            if (language === "go" && file.toLowerCase().includes('test')) {
                console.log(`Ignoring test file: ${fullPath}`);
            } else {
                Files.push(fullPath);
            }
        }
    });
}

export async function saveGeneratedCodeToIntermediateLocationWithSrc(code: string, fullfileName: string, folderName: string): Promise<string> {
    const fullPath = path.join(folderName, fullfileName);
	const folderPath = path.dirname(fullPath);
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}

    fs.writeFileSync(fullPath, code, 'utf8');
    console.log(`Generated code saved to ${fullPath}`);
    return fullPath;
}


export function generateFileNameForDiffLanguage(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, folderPath: string, language:string){
    const fileSig = genFileNameWithGivenSymbol(document, symbol, language);
    const suffix = getLanguageSuffix(language); // Get suffix based on language
    let fileName;
    let baseName;
    let disposableSuffix;
    switch (language) {
        case "go":
            const testFileFormatForGo = "_test"
            fileName = `${fileSig}${testFileFormatForGo}.${suffix}`;
            baseName = fileName.replace(/(_test\.\w+)$/, '');  // This removes 'Test.${suffix}'
            disposableSuffix = fileName.replace(/^.*(_test\.\w+)$/, '$1');  // This isolates 'Test.${suffix}'
            break;
        case "java":
            const testFileFormatForJava = "Test"
            fileName = `${fileSig}${testFileFormatForJava}.${suffix}`;
            baseName = fileName.replace(/(Test\.\w+)$/, '');  // This removes 'Test.${suffix}'
            disposableSuffix = fileName.replace(/^.*(Test\.\w+)$/, '$1');  // This isolates 'Test.${suffix}'
            break;
        default:
            const uniTestFileFormat = "_test"
            fileName = `${fileSig}${uniTestFileFormat}.${suffix}`;
            baseName = fileName.replace(/(_test\.\w+)$/, '');  // This removes 'Test.${suffix}'
            disposableSuffix = fileName.replace(/^.*(_test\.\w+)$/, '$1');  // This isolates 'Test.${suffix}'
            break;
    }

    return {document, symbol, fileName : getUniqueFileName(folderPath, baseName, disposableSuffix)}
}

export function genFileNameWithGivenSymbol(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, language: string): string {
    const fileName = document.fileName.split('/').pop()!.replace(/\.\w+$/, '');
    const funcName = document.getText(symbol.selectionRange);
    const finalName = `${fileName}_${funcName}`;
    if (language === 'java') {
        const packageStatements = getPackageStatement(document, document.languageId)
        const packageStatement = packageStatements ? packageStatements[0] : '';
        const packageFolder = packageStatement.replace(";","").split(' ')[1].replace(/\./g, '/');
        return `${packageFolder}/${finalName}`;
    } else {
        return finalName;
    }
}


export function getUniqueFileName(folderPath: string, baseName: string, suffix: string): string {
    let counter = 1;

    // Initial new file name with counter right before Test.${suffix}
    let newFileName = `${baseName}${counter}${suffix}`;
    
    // Check if the file exists, and increment the counter if it does
    while (fs.existsSync(`${folderPath}/${newFileName}`)) {
        counter++;
        newFileName = `${baseName}${counter}${suffix}`;
    }
    // Ensure the new file name is unique
    const filePath = path.join(folderPath, newFileName);

    // Create the file (if it doesn't exist)
    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    fs.writeFileSync(filePath, '', { flag: 'wx' }); // Creates the file, but throws error if it exists

    // Return the full path of the unique file name
    return filePath;
}
