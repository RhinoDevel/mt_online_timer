
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
        (o) =>
            console.log(`Internet access set request response JSON: "${JSON.stringify(o)}"`),
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

function createState()
{
    const dateTimeNow = new Date();

    return {
        isRunning: false,
        remainingSeconds: FULL_SECONDS,
        isLocked: false,
        lastDay: getDayStr(dateTimeNow),
        lastTimestampSeconds: getTimestampSeconds(dateTimeNow),
    };
}

function loadOrCreateState()
{
    if (fs.existsSync(ABS_PATH_STATE))
    {
        return JSON.parse(fs.readFileSync(ABS_PATH_STATE));
    }
    return createState();
}

function saveState(state)
{
    fs.writeFileSync(ABS_PATH_STATE, JSON.stringify(state));
}

function getDaySyncState(state)
{
    if(state.lastDay === getDayStr(new Date()))
    {
        return state; // Still the same day, nothing to do.
    }
    return createState(); // A new day!
}

async function intervalHandler()
{
    try
    {
        let state = loadOrCreateState();

        // Make sure that day is up-to-date (haha):
        state = getDaySyncState(state);
        saveState(state); // Saves to file.

        if (!state.isRunning || state.isLocked)
        {
            return;
        }
        
        const curTimestampSeconds = getTimestampSeconds(Date.now());
        const elapsedSeconds = curTimestampSeconds - state.lastTimestampSeconds;

        state.lastTimestampSeconds = curTimestampSeconds;
        state.remainingSeconds -= elapsedSeconds;

        if (state.remainingSeconds <= 0.0)
        {
            state.remainingSeconds = 0.0;
            state.isRunning = false;
            state.isLocked = true;

            // Disable internet:
            try
            {
                console.log('Disabling internet..');
                setInternetAccess(CLIENT_IP, false);
            }
            catch (err)
            {
                console.error(
                    `Internet-disable exceptional error with msg. "${err.message}" (2)!`);
            }
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
        let state = loadOrCreateState();
        const parsedUrl = parse(req.url, true); // TODO: Check!

        state = getDaySyncState(state); // Resets, if it is a new day.
        saveState(state); // Makes sure that file reflects current state.

        if (parsedUrl.pathname === HTTP_PATHNAME_TOGGLE)
        {
            // *******************
            // *** TOGGLE PAGE ***
            // *******************

            if (state.isLocked)
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
                    res.end(ERR_EXCEPTION);
                }
                return;
            }
        
            // Not running.

            try
            {
                console.log('(Re-)enabling internet..');
                 setInternetAccess(CLIENT_IP, true);

                state.isRunning = true;
                state.lastTimestampSeconds = getTimestampSeconds(Date.now());
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
                res.end(ERR_EXCEPTION);
            }
            return;
        }

        // *****************
        // *** MAIN PAGE ***
        // *****************

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
            state.isLocked
                ? 'Leider keine Internet-Minuten mehr vorhanden (morgen wieder).'
                : `<div>Internet-Minuten: ${Math.trunc(state.remainingSeconds / 60.0)}</div><div><a href="${HTTP_PATHNAME_TOGGLE}"><button>${state.isRunning ? 'Pause' : 'Internet!!!'}</button></a></div>`);
    }
    catch (err)
    {
        console.error(
            `Server exceptional error with msg. "${err.message}"!`);

        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(ERR_EXCEPTION);
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
