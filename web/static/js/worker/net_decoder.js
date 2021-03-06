/*
This file is part of FFLiveParse.

FFLiveParse is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

FFLiveParse is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with FFLiveParse.  If not, see <https://www.gnu.org/licenses/>.
*/

var DATA_TYPE_ENCOUNTER = 2;
var DATA_TYPE_COMBATANT = 3;
var DATA_TYPE_LOG_LINE = 5;
var DATA_TYPE_FLAG = 99;

var SIZE_BYTE = 1;
var SIZE_INT16 = 2;
var SIZE_INT32 = 4;

var totalBytesRecieved = 0;
var hasEncounter = false;
var reportStatus = false;
var partialBuffer = {};

function readInt32(data, pos)
{
    return new DataView(data.buffer, pos, SIZE_INT32).getInt32(0)
}

function readUint32(data, pos)
{
    return new DataView(data.buffer, pos, SIZE_INT32).getUint32(0)
}

function readUint16(data, pos)
{
    return new DataView(data.buffer, pos, SIZE_INT16).getUint16(0)
}

function readByte(data, pos)
{
    return data[pos];
}

function readString(data, pos)
{
    var strLen = readUint16(data, pos);
    return new TextDecoder("utf-8").decode(data.slice(pos + 2, pos + 2 + strLen));
}

// @see https://stackoverflow.com/questions/40031688/javascript-arraybuffer-to-hex
function buf2hex(buffer)
{
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

// @see https://stackoverflow.com/questions/33702838/how-to-append-bytes-multi-bytes-and-buffer-to-arraybuffer-in-javascript
function concatTypedArrays(a, b) {
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}

function decodeEncounterBytes(data)
{
    if (data[0] != DATA_TYPE_ENCOUNTER) {
        return null;
    }
    var pos = 1;
    var output = {
        "Type" : DATA_TYPE_ENCOUNTER
    };
    output["UID"]           = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["StartTime"]     = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["EndTime"]       = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["Zone"]          = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["Damage"]        = readUint32(data, pos); pos += SIZE_INT32;
    output["Active"]        = readByte(data, pos) != 0; pos += SIZE_BYTE;
    output["EndWait"]       = readByte(data, pos) != 0; pos += SIZE_BYTE;
    output["SuccessLevel"]  = readByte(data, pos); pos += SIZE_BYTE;
    
    output["StartTime"]     = new Date(output["StartTime"]);
    output["EndTime"]       = new Date(output["EndTime"]);

    if (!encounterUid || output["UID"] == encounterUid) {
        if (output.Zone) {
            hasEncounter = true;
        }
        postMessage({
            "type"      : "act:encounter",
            "data"      : output
        });
    }
    return pos;
}

function decodeCombatantBytes(data)
{
    if (data[0] != DATA_TYPE_COMBATANT) {
        return 0;
    }
    var pos = 1;
    var output = {
        "Type" : DATA_TYPE_COMBATANT
    };
    output["EncounterUID"]  = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["ID"]            = readInt32(data, pos); pos += SIZE_INT32;
    output["Name"]          = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["World"]         = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["Job"]           = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["Damage"]        = readInt32(data, pos); pos += SIZE_INT32;
    output["DamageTaken"]   = readInt32(data, pos); pos += SIZE_INT32;
    output["DamageHealed"]  = readInt32(data, pos); pos += SIZE_INT32;
    output["Deaths"]        = readInt32(data, pos); pos += SIZE_INT32;
    output["Hits"]          = readInt32(data, pos); pos += SIZE_INT32;
    output["Heals"]         = readInt32(data, pos); pos += SIZE_INT32;
    output["Kills" ]        = readInt32(data, pos); pos += SIZE_INT32;
    output["Time"]          = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["Time"]          = new Date(output["Time"]);
    if (!encounterUid || output["EncounterUID"] == encounterUid) {
        postMessage({
            "type"      : "act:combatant",
            "data"      : output
        });
    }
    return pos;
}

function decodeLogLineBytes(data)
{
    if (data[0] != DATA_TYPE_LOG_LINE) {
        return 0;
    }
    var pos = 1;
    var output = {
        "Type" : DATA_TYPE_LOG_LINE
    };
    output["EncounterUID"]  = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["Time"]          = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["LogLine"]       = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;

    output["Time"]          = new Date(output["Time"]);
    if (!encounterUid || output["EncounterUID"] == encounterUid) {
        postMessage({
            "type"      : "act:logLine",
            "data"      : output
        });
    }
    return pos;
}

function decodeFlagBytes(data)
{
    if (data[0] != DATA_TYPE_FLAG) {
        return 0;
    }
    var pos = 1;
    var output = {
        "Type" : DATA_TYPE_FLAG
    };
    output["Name"]          = readString(data, pos); pos += readUint16(data, pos) + SIZE_INT16;
    output["Value"]         = readByte(data, pos) != 0; pos += SIZE_BYTE;
    postMessage({
        "type"      : "flag",
        "data"      : output
    });
    return pos;
}

function parseNextMessage(buffer, pos, count)
{
    var data = new Uint8Array(buffer.slice(pos));
    var length = 0;
    switch (data[0])
    {
        case DATA_TYPE_ENCOUNTER:
        {
            length = decodeEncounterBytes(data);
            break;
        }
        case DATA_TYPE_COMBATANT:
        {
            length = decodeCombatantBytes(data);
            break;
        }
        case DATA_TYPE_LOG_LINE:
        {
            length = decodeLogLineBytes(data);
            break;
        }
        case DATA_TYPE_FLAG:
        {
            length = decodeFlagBytes(data);
            break;
        }
    }
    delete data;
    if (length <= 0) {
        postMessage({
            "type"      : "status_ready"
        });
        return;
    }
    pos += length;
    // every ~200 send status update and use setTimeout to prevent recursion error
    if (count > 200) {
        if (reportStatus) {
            var loadingProgress = ((pos / buffer.byteLength) * 100).toFixed(1);
            postMessage({
                "type"      : "status_in_progress",
                "message"   : "Loading (" + loadingProgress + "%)",
                "value"     : loadingProgress
            });
        }
        setTimeout(function() { parseNextMessage(buffer, pos, 0); }, 1);
        return;
    }
    parseNextMessage(buffer, pos, count + 1);
}

function parseMessage(data)
{
    totalBytesRecieved += data.length;
    reportStatus = false;
    if (data.length > 102400) {
        reportStatus = true;
    }
    // decompress
    data = pako.inflate(data)
    if (data.length > 0) {
        parseNextMessage(data.buffer, 0, 0);
    }
}
