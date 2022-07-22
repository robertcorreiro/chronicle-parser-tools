import { getPackedSettings } from 'http2';
import * as vscode from 'vscode';

const {google} = require('googleapis');

const AUTHORIZATION_SCOPES = ['https://www.googleapis.com/auth/chronicle-backstory'];

// URLs for Chronicle API Regions
const CHRONICLE_API_V1_URL = 'https://backstory.googleapis.com/v1';
const CHRONICLE_API_EUROPE_V1_URL = 'https://europe-backstory.googleapis.com/v1';
const CHRONICLE_API_ASIA_URL = 'https://asia-southeast1-backstory.googleapis.com/v1';

const LIST_SCHEME = "chronicle";
const GET_SCHEME = "chronicle.get";
const HIST_SCHEME = "chronicle.history";

// Placeholders
const PLACEHOLDER_CONFIG_ID = '12345678-abcd-1234-abcd-1234567890ab';


export async function activate(context: vscode.ExtensionContext) {
	
	const listProvider = new class implements vscode.TextDocumentContentProvider {
		onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
		onDidChange = this.onDidChangeEmitter.event;

		provideTextDocumentContent(uri: vscode.Uri): string {
			return decodeURIComponent(uri.path.toString());
		}
	};
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(LIST_SCHEME, listProvider));

	const getProvider = new class implements vscode.TextDocumentContentProvider {
		onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
		onDidChange = this.onDidChangeEmitter.event;

		provideTextDocumentContent(uri: vscode.Uri): string {
			return decodeURIComponent(uri.path.toString());
		}
	};
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(GET_SCHEME, getProvider));

	const histProvider = new class implements vscode.TextDocumentContentProvider {
		onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
		onDidChange = this.onDidChangeEmitter.event;

		provideTextDocumentContent(uri: vscode.Uri): string {
			return decodeURIComponent(uri.path.toString());
		}
	};
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(HIST_SCHEME, histProvider));

	context.subscriptions.push(vscode.commands.registerCommand('chronicle-parser-tools.list', () => {
		listParsers(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('chronicle-parser-tools.download', () => {
		downloadParser(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('chronicle-parser-tools.archive', () => {
		archiveParser(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('chronicle-parser-tools.create', () => {
		createParser(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('chronicle-parser-tools.sample', () => {
		sampleLogs(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('chronicle-parser-tools.validate', () => {
		validateParser(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('chronicle-parser-tools.history', () => {
		parserHistory(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('chronicle-parser-tools.refresh', async () => {
		if (!vscode.window.activeTextEditor) {
			return; // no editor
		}
		const { document } = vscode.window.activeTextEditor;
		if (document.uri.scheme !== GET_SCHEME) {
			return; // not get scheme
		}
		getParser(context);
	}));
}

async function getKeyFile() {
	let keyFile = await vscode.workspace.getConfiguration().get("chronicle.serviceAccountFilePath");

	if (!keyFile) {
		vscode.window.showInformationMessage('Error: Service Account File Path is not configured');
		vscode.commands.executeCommand('workbench.action.openSettings', '@ext:chronicle.chronicle-parser-tools');
	}
	return keyFile;
}

async function getClient() {
	let keyFile = await getKeyFile();

	let auth = new google.auth.GoogleAuth({
		keyFile: keyFile,
		scopes: ['https://www.googleapis.com/auth/chronicle-backstory'],
	  });
	return await auth.getClient();
}

async function getConnectingURL(context: vscode.ExtensionContext) {
	let url = CHRONICLE_API_V1_URL;
	let region = await vscode.workspace.getConfiguration().get("chronicle.region");

	if (region === "EUROPE") {
		url = CHRONICLE_API_EUROPE_V1_URL;
	} else if (region === "ASIA") {
		url = CHRONICLE_API_ASIA_URL;
	}
	return url;
}

async function makeRequest(url: string, method: string = "GET", body: string | undefined = undefined) {
	let client = await getClient();
	let res = await client.request({ url:url, method:method, body:body });
	return res.data;
}

async function listParsers(context: vscode.ExtensionContext) {
	let url = await getConnectingURL(context) + "/tools/cbnParsers";

	let data: any;
	try {
		data = await makeRequest(url);
	} catch (e) {
		vscode.window.showErrorMessage("" + e);
		return;
	}

	if (!('cbnParsers' in data)) {
		vscode.window.showInformationMessage("No parsers found.");
		return;
	}

	let parsers = data.cbnParsers;
	parsers.forEach((parser: any) => {
		delete parser["config"];  // cleans up output
	});

	const uri = vscode.Uri.parse(LIST_SCHEME + ':' + JSON.stringify(parsers, null, 2));
	const doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
	await vscode.window.showTextDocument(doc, { preview: true });
}

async function getParser(context: vscode.ExtensionContext) {
	let url = await getConnectingURL(context) + "/tools/cbnParsers/" + context.workspaceState.get("configId");

	let data: any;
	try {
		data = await makeRequest(url);
	} catch (e) {
		vscode.window.showErrorMessage("" + e);
		return;
	}

	const uri = vscode.Uri.parse(GET_SCHEME + ':' + JSON.stringify(data, null, 2));
	const doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
	await vscode.window.showTextDocument(doc, { preview: true });
}

async function downloadParser(context: vscode.ExtensionContext) {
	let configID = await vscode.window.showInputBox(
		{
			title: 'Download Parser',
			prompt: 'Enter a configId (UUID) to download', 
			placeHolder: PLACEHOLDER_CONFIG_ID
		}
	);
	if (!configID) { return; }

	let url = await getConnectingURL(context) + "/tools/cbnParsers/" + configID;

	let data: any;
	try {
		data = await makeRequest(url);
	} catch (e) {
		vscode.window.showErrorMessage("" + e);
		return;
	}

	let config = Buffer.from(data.config, 'base64').toString();  // Base64 encoded
	const doc = await vscode.workspace.openTextDocument({content: config});
	
	await vscode.window.showTextDocument(doc, { preview: true });
}

async function archiveParser(context: vscode.ExtensionContext) {
	let configID = await vscode.window.showInputBox(
		{
			title: 'Archive Parser',
			prompt: 'Enter a configId (UUID) to archive', 
			placeHolder: PLACEHOLDER_CONFIG_ID
		}
	);
	if (!configID) { return; }

	let url = await getConnectingURL(context) + '/tools/cbnParsers/' + configID + ':archive';

	let data: any;
	try {
		data = await makeRequest(url, 'POST');
	} catch (e) {
		vscode.window.showErrorMessage("" + e);
		return;
	}

	const uri = vscode.Uri.parse(GET_SCHEME + ':' + JSON.stringify(data, null, 2));
	const doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
	await vscode.window.showTextDocument(doc, { preview: true });
}

async function parserHistory(context: vscode.ExtensionContext) {
	let logType = await vscode.window.showInputBox(
		{
			title: 'Parser History',
			prompt: 'Enter a data type to retrieve its parser history', 
			placeHolder: "DATA_TYPE"
		}
	);
	if (!logType) { return; }

	let url = await getConnectingURL(context) + "/tools/cbnParsers/:listCbnParserHistory?log_type=" + logType;

	let data: any;
	try {
		data = await makeRequest(url);
	} catch (e) {
		vscode.window.showErrorMessage("" + e);
		return;
	}

	const uri = vscode.Uri.parse(HIST_SCHEME + ':' + JSON.stringify(data, null, 2));
	const doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
	await vscode.window.showTextDocument(doc, { preview: true });
}

async function getFileByExt(context: vscode.ExtensionContext, wantExt: string, title: string | undefined = undefined) {
	let files: string[] = [];
	await vscode.workspace.textDocuments.forEach(doc => {
		let ext = doc.fileName.split('.').pop();
		if (ext === wantExt) {
			files.push(doc.fileName || "");
		}
	});
	if (files.length === 0) { return; }

	let file = await vscode.window.showQuickPick(files, {
		title: title,
		placeHolder: "Select a " + wantExt + " file"
	}) || "";
	if (!file) { return; }

	let confText = await (await vscode.workspace.openTextDocument(file)).getText();
	return Buffer.from(confText).toString('base64');
}

async function createParser(context: vscode.ExtensionContext) {
	context.workspaceState.update("configId", "");  // clear out any previous values

	let author = await vscode.workspace.getConfiguration().get("chronicle.author");
	if (!author) {
		vscode.window.showErrorMessage('"Author" setting is not configured');
		vscode.commands.executeCommand('workbench.action.openSettings', '@ext:chronicle.chronicle-parser-tools');
		return;
	}

	let config = await getFileByExt(context, 'conf', 'Create Parser (1/2)');
	if (!config) {
		vscode.window.showErrorMessage('No ".conf" files found  in workspace.');
		return;
	}
	
	let logType = await vscode.window.showInputBox(
		{
			title: 'Create Parser (2/2)',
			prompt: 'Enter a data type for the new parser', 
			placeHolder: "DATA_TYPE"
		}
	);
	if (!logType) { return; }

	let url = await getConnectingURL(context) + '/tools/cbnParsers';
	let body = {
		'config': config,
		'log_type': logType,
		'author': author
	};
	
	let data: any;
	try {
		data = await makeRequest(url, 'POST', JSON.stringify(body));
	} catch (e) {
		vscode.window.showErrorMessage("" + e);
		return;
	}

	context.workspaceState.update("configId", data.configId);  // store to use with refresh

	const uri = vscode.Uri.parse(GET_SCHEME + ':' + JSON.stringify(data, null, 2));
	const doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
	await vscode.window.showTextDocument(doc, { preview: true });
}

async function sampleLogs(context: vscode.ExtensionContext) {
	let logType = await vscode.window.showInputBox(
		{
			title: 'Retrieve Sample Logs (1/4)',
			prompt: 'Retrieve logs for which data type?', 
			placeHolder: "DATA_TYPE"
		}
	);
	if (!logType) { return; }

	let sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	let startTime = await vscode.window.showInputBox(
		{
			title: 'Retrieve Sample Logs (2/4)',
			prompt: 'Retrieve logs starting at what datetime? (default: 7 days ago)', 
			value: sevenDaysAgo.toISOString(),
		}
	);
	if (!startTime) { return; }

	let endTime = await vscode.window.showInputBox(
		{
			title: 'Retrieve Sample Logs (3/4)',
			prompt: 'Retrieve logs ending at what datetime? (default: now)', 
			value: (new Date()).toISOString(),
		}
	);
	if (!endTime) { return; }

	let maxEntries = await vscode.window.showInputBox(
		{
			title: 'Retrieve Sample Logs (4/4)',
			prompt: 'Retrieve a maximum of how many samples? (default: 10)', 
			value: '10',
		}
	);
	if (!maxEntries) { return; }

	let url = await getConnectingURL(context) + '/tools:retrieveSampleLogs';

	let body = {
		'log_type': logType,
		'start_time': startTime,
		'end_time': endTime,
		'max_entries': maxEntries
	};

	let samples: any;
	try {
		samples = await makeRequest(url, 'POST', JSON.stringify(body));
	} catch (e) {
		vscode.window.showErrorMessage("" + e);
		return;
	}

	let lines = "";
	samples.data.forEach( (sample:any) => {
		let decoded = Buffer.from(sample, 'base64').toString();
		let unescaped = JSON.parse(decoded);
		lines += JSON.stringify(unescaped) + "\n";
	});
	if (lines === "") { return; }
	
	const doc = await vscode.workspace.openTextDocument({content: lines});
	await vscode.window.showTextDocument(doc, { preview: true });
}

async function validateParser(context: vscode.ExtensionContext) {
	let config = await getFileByExt(context, 'conf', 'Validate Parser (1/2)');
	if (!config) {
		vscode.window.showErrorMessage('No ".conf" files found in workspace.');
		return;
	}
	
	let logs = await getFileByExt(context, "log", 'Validate Parser (2/2)');
	if (!logs) {
		vscode.window.showErrorMessage('No ".log" files found in workspace.');
		return;
	}

	let url = await getConnectingURL(context) + '/tools:validateCbnParser';
	let body = {
		'config': config,
		'logs': logs
	};

	let data: any;
	try {
		data = await makeRequest(url, 'POST', JSON.stringify(body));
	} catch (e) {
		vscode.window.showErrorMessage("" + e);
		return;
	}

	if (!('result' in data)) {
		vscode.window.showErrorMessage("No results found within API response");
		return;
	}

	let results = data.result;

	const uri = vscode.Uri.parse(LIST_SCHEME + ':' + results.join(''));
	const doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
	await vscode.window.showTextDocument(doc, { preview: true });
}

export function deactivate() {}
