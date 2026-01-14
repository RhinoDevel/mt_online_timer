
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

function saveState(state)
{
    fs.writeFileSync(ABS_PATH_STATE, JSON.stringify(state));
}

/**
 * - Does not change the is-running property.
 */
function getUpToDateState()
{
    let state = null;
    const dateTimeNow = new Date();
    const dayStr = dateTime.toISOString().slice(0, 10);
    let isRunning = false;

    if (fs.existsSync(ABS_PATH_STATE))
    {
        state = JSON.parse(fs.readFileSync(ABS_PATH_STATE));

        if(state.dayStr === dayStr)
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
        dayStr: dayStr,
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
        
        const curTimestampSeconds = getTimestampSeconds(Date.now());
        const elapsedSeconds = curTimestampSeconds - state.timestampSeconds;

        state.timestampSeconds = curTimestampSeconds;
        state.remainingSeconds -= elapsedSeconds;

        if (state.remainingSeconds <= 0.0)
        {
            state.remainingSeconds = 0.0; // <=> Locked
            state.isRunning = false;

            console.log('Disabling internet..');
            setInternetAccess(CLIENT_IP, false);
        }

        saveState(state);
    }
    catch (err)
    {
        console.error(`Timer exceptional error with msg. "${err.message}"!`);
    }
}

function isLocked(state)
{
    return state.remainingSeconds === 0.0;
}

async function httpReqHandler(req, res)
{
    try
    {
        const parsedUrl = parse(req.url, true); // TODO: Check!
        const state = getUpToDateState();

        if (parsedUrl.pathname === HTTP_PATHNAME_TOGGLE)
        {
            // *******************
            // *** TOGGLE PAGE ***
            // *******************

            if (isLocked(state))
            {
                // Already locked.

                // Redirect back to main page.
                res.writeHead(302, { Location: '/' });
                res.end();
                return;
            }

            // Not locked.

            if (state.isRunning)
            {
                // Is running.

                try
                {
                    console.log('Pausing internet timer..');
                    setInternetAccess(CLIENT_IP, false);
                    state.isRunning = false;
                    saveState(state);
                    
                    // Redirect back to main page.
                    res.writeHead(302, { Location: '/' });
                    res.end();
                }
                catch (err)
                {
                    console.error(
                        `Internet-disable exceptional error with msg. "${err.message}" (1)!`);

                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end(MSG_ERR_EXCEPTION);
                }
                return;
            }
        
            // Not running.

            try
            {
                console.log('(Re-)enabling internet..');
                 setInternetAccess(CLIENT_IP, true);

                state.isRunning = true;
                state.timestampSeconds = getTimestampSeconds(Date.now());
                saveState(state);

                // Redirect back to main page.
                res.writeHead(302, { Location: '/' });
                res.end();
            }
            catch (err)
            {
                console.error(
                    `Internet-enable exceptional error with msg. "${err.message}"!`);

                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(MSG_ERR_EXCEPTION);
            }
            return;
        }

        // *****************
        // *** MAIN PAGE ***
        // *****************

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
            isLocked(state)
                ? 'Leider keine Internet-Minuten mehr vorhanden (morgen wieder).'
                : `<div>Internet-Minuten: ${Math.trunc(state.remainingSeconds / 60.0)}</div><div><a href="${HTTP_PATHNAME_TOGGLE}"><button>${state.isRunning ? 'Pause' : 'Internet!!!'}</button></a></div>`);
    }
    catch (err)
    {
        console.error(
            `Server exceptional error with msg. "${err.message}"!`);

        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(MSG_ERR_EXCEPTION);
    }
}

function httpListen()
{
    console.log(`Listening at port ${String(HTTP_PORT)}..`);
}

// *****************************************************************************
// *** START INTERVAL TIMER                                                  ***
// *****************************************************************************

setInterval(intervalHandler, TIMER_INTERVAL_SECONDS * 1000);

// *****************************************************************************
// *** START HTTP SERVER                                                     ***
// *****************************************************************************

http.createServer(httpReqHandler).listen(HTTP_PORT, httpListen);
