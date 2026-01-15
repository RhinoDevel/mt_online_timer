
// Marcel Timm, RhinoDevel, 2026jan13

// *****************************************************************************
// *** IMPORTS                                                               ***
// *****************************************************************************

import http from "http";
import fs from "fs";
import { parse } from "url";

// This is specific for AVM FritzBox usage as server that provides the API to
// enable/disable internet access per client IP address:
import fb from './nodejs-fritzbox/nodejs-fritzbox.js';

// *****************************************************************************
// *** CONFIGURATION                                                         ***
// *****************************************************************************

// For this server:
const HTTP_PATHNAME_TOGGLE = '/toggle';
const HTTP_PORT = 7581;

// These are specific for AVM FritzBox usage as server that provides the API to
// enable/disable internet access per client IP address:
const FB_USERNAME = '********'
const FB_PASSWORD = '********';
const FB_ACTION = 'disallowWANAccessByIP';

// The IP address of the (single) client whose internet access we are
// restricting/handling, here: 
const CLIENT_IP = '192.168.178.14';

const FULL_SECONDS = 60 * 90; // Client's internet access time per day.

// *****************************************************************************
// *** CONSTANTS                                                             ***
// *****************************************************************************

const ABS_PATH_STATE = 'state.json';

const MSG_ERR_EXCEPTION = 'Ups, etwas hat nicht funktioniert! :-(';

const TIMER_INTERVAL_SECONDS = 30;

// *****************************************************************************
// *** FUNCTIONS                                                             ***
// *****************************************************************************

/** Enables/disables internet access via client with given IP address.
 * 
 *  - Change this function, if you want to use some other server to
 *    block/unblack internet access than an AVM FritzBox.
 */
function setInternetAccess(clientIpAddr, isAllowed)
{
    // This is specific for AVM FritzBox usage as server that provides the API
    // to enable/disable internet access per client IP address:
    fb.exec(
        o => console.log(`Internet access set request response JSON: "${JSON.stringify(o)}"`),
        FB_USERNAME,
        FB_PASSWORD,
        FB_ACTION,
        [
            clientIpAddr,
            isAllowed ? 0 : 1 // 0 = NOT disabled, 1 = Disabled.
        ]);
};

function getTimestampSeconds(dateTime)
{
    return Math.trunc(dateTime.getTime() / 1000.0);
}

function getDayStr(dateTime)
{
    return dateTime.toISOString().slice(0, 10);
}

function saveState(state)
{
    fs.writeFileSync(ABS_PATH_STATE, JSON.stringify(state));
}

/**
 * - Does not change the is-running property.
 */
function getUpToDateState()
{
    const dateTimeNow = new Date();
    let state = null;
    let isRunning = false;

    if (fs.existsSync(ABS_PATH_STATE))
    {
        state = JSON.parse(fs.readFileSync(ABS_PATH_STATE));
        
        const timestampDayStr =
            getDayStr(new Date(1000.0 * state.timestampSeconds));

        if(timestampDayStr === getDayStr(dateTimeNow))
        {
            return state; // Still the same day, nothing to do.
        }

        // The date has changed, we must reset the time contingent, etc.
        isRunning = state.isRunning; // Keeps is-running state.
    }

    // There either was no state file found or the date stored in the loaded
    // state is not today's date.

    state = {
        isRunning: isRunning,
        remainingSeconds: FULL_SECONDS,
        timestampSeconds: getTimestampSeconds(dateTimeNow),
    };

    saveState(state); // Makes sure that file reflects current state.

    return state;
}

/** If timer is currently running (so internet access must be enabled and lock
 *  must not be set), this function updates the state's time properties (also
 *  saves to file). It will also disable the internet access for the client IP,
 *  if state is locked (no more time available). 
 */
async function intervalHandler()
{
    try
    {
        const state = getUpToDateState(); // Won't change is-running property.

        if (!state.isRunning)
        {
            return;
        }
        
        const timestampSeconds = getTimestampSeconds(new Date());
        const elapsedSeconds = timestampSeconds - state.timestampSeconds;

        state.timestampSeconds = timestampSeconds;
        state.remainingSeconds -= elapsedSeconds;

        if (state.remainingSeconds <= 0.0)
        {
            state.remainingSeconds = 0.0; // <=> Locked
            state.isRunning = false;

            console.log('Disabling internet (2)..');
            setInternetAccess(CLIENT_IP, false);
        }

        saveState(state);
    }
    catch (err)
    {
        console.error(`Timer exceptional error with msg. "${err.message}"!`);
    }
}

async function httpReqHandler(req, res)
{
    try
    {
        const state = getUpToDateState();
        const isLocked = state.remainingSeconds === 0.0;

        if (parse(req.url, true).pathname !== HTTP_PATHNAME_TOGGLE)
        {
            // *****************
            // *** MAIN PAGE ***
            // *****************

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(
                `<!DOCTYPE html>
		    <html style="user-select: none;">
                        <head>
                            <meta charset="utf-8">
                            <title>Internet Timer</title>
                        </head>
                        <body>`

                + '<div style="display: flex; flex-direction: column; align-items: center; gap: 1.0em; margin: 1.5em; font-size: xxx-large;">'
                    + (isLocked
                        ?
                    `<div style="text-align: center;">
                        Leider keine Internet-Minuten mehr vorhanden (morgen wieder).
                    </div>`
                        :
                    `<div style="text-align: center;">
                        Internet-Minuten: ${Math.trunc(state.remainingSeconds / 60.0)}
                    </div>
                    <div style="text-align: center;">
                        ${state.isRunning ? 'Internet ist <u>eingeschaltet</u> (die Zeit l&auml;uft).' : 'Internet ist <u>ausgeschaltet</u> (die Zeit l&auml;uft nicht).'}
                    </div>
                    <div>
                        <a href="${HTTP_PATHNAME_TOGGLE}">
                            <button style="font-size: inherit; ${state.isRunning ? 'background-color: red;' : 'background-color: green; color: yellow;'}">
                                ${state.isRunning ? 'Pause' : 'einschalten'}
                            </button>
                        </a>
                    </div>`)
                 + `<div>
                        <button onclick="window.location.reload();" style="font-size: inherit;">
                            aktualisieren
                        </button>
                    </div>
                </div>`

                        + `</body>
                    </html>`
		);
            return;
        }

        // *******************
        // *** TOGGLE PAGE ***
        // *******************

        if (isLocked)
        {
            // Redirect back to main page.
            res.writeHead(302, { Location: '/' });
            res.end();
            return;
        }
        
        console.log(
            state.isRunning
                ? 'Pausing internet timer..' : '(Re-)enabling internet..');
        state.isRunning = !state.isRunning;
        if(state.isRunning)
        {
            state.timestampSeconds = getTimestampSeconds(new Date());
        }
        setInternetAccess(CLIENT_IP, state.isRunning);
        saveState(state);

        // Redirect back to main page.
        res.writeHead(302, { Location: '/' });
        res.end();        
    }
    catch (err)
    {
        console.error(`Server exceptional error with msg. "${err.message}"!`);

        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(MSG_ERR_EXCEPTION);
    }
}

function httpListen()
{
    console.log(`Listening at port ${String(HTTP_PORT)}..`);
}

// *****************************************************************************
// *** DISABLE INTERNET ACCESS                                               ***
// *****************************************************************************

console.log('Disabling internet (1)..');
setInternetAccess(CLIENT_IP, false);
const state = getUpToDateState();
state.isRunning = false;
saveState(state);

// *****************************************************************************
// *** START INTERVAL TIMER                                                  ***
// *****************************************************************************

setInterval(intervalHandler, TIMER_INTERVAL_SECONDS * 1000);

// *****************************************************************************
// *** START HTTP SERVER                                                     ***
// *****************************************************************************

http.createServer(httpReqHandler).listen(HTTP_PORT, httpListen);
