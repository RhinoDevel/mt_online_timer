
// Marcel Timm, RhinoDevel, 2026jan13

import fb from './nodejs-fritzbox/nodejs-fritzbox.js';

const FB_USERNAME = '********'
const FB_PASSWORD = '********';
const FB_ACTION = 'disallowWANAccessByIP';

const CLIENT_IP = '192.168.178.14';

function setInternetAccess(clientIpAddr, isAllowed)
{
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