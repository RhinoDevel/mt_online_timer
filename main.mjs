
// Marcel Timm, RhinoDevel, 2026jan13

// This is specific for AVM FritzBox usage as server that provides the API to
// enable/disable internet access per client IP address:
import fb from './nodejs-fritzbox/nodejs-fritzbox.js';

// *****************************************************************************
// *** CONFIGURATION                                                         ***
// *****************************************************************************

// These are specific for AVM FritzBox usage as server that provides the API to
// enable/disable internet access per client IP address:
const FB_USERNAME = '********'
const FB_PASSWORD = '********';
const FB_ACTION = 'disallowWANAccessByIP';

// The IP address of the (single) client whose internet access we are
// restricting/handling, here: 
const CLIENT_IP = '192.168.178.14';

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

setInternetAccess(CLIENT_IP, true);