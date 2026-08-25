const vscode = require('vscode');
const { spawn, exec } = require('child_process');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

const SCRIPT    = 'C:/Websites/jubileeverse.com/tools/speak.py';
const STOP_FILE = path.join(os.tmpdir(), 'jv_speak_stop');
let speakProcess = null;

function stopSpeaking() {
    // Write stop signal — player polls this every 50ms and sends MCI stop/close
    try { fs.writeFileSync(STOP_FILE, ''); } catch (_) {}
    // Kill Python process tree as backup
    if (speakProcess) {
        exec(`taskkill /F /T /PID ${speakProcess.pid}`, () => {});
        speakProcess = null;
    }
}

function activate(context) {

    const speakCmd = vscode.commands.registerCommand('jubilee-speak.speakSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const text = editor.document.getText(editor.selection).trim();
        if (!text) {
            vscode.window.showWarningMessage('Select some text first.');
            return;
        }

        stopSpeaking();

        const tmpFile = path.join(os.tmpdir(), 'jv_speak.txt');
        fs.writeFileSync(tmpFile, text, 'utf8');

        speakProcess = spawn('python', [SCRIPT, tmpFile], {
            stdio: 'ignore',
            detached: false
        });

        speakProcess.on('close', () => {
            speakProcess = null;
            try { fs.unlinkSync(tmpFile); } catch (_) {}
        });

        speakProcess.on('error', (err) => {
            speakProcess = null;
            vscode.window.showErrorMessage(`Speak failed: ${err.message}`);
        });
    });

    const stopCmd = vscode.commands.registerCommand('jubilee-speak.stopSpeaking', () => {
        stopSpeaking();
    });

    context.subscriptions.push(speakCmd, stopCmd);
}

function deactivate() { stopSpeaking(); }

module.exports = { activate, deactivate };
