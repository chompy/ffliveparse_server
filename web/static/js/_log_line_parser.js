
// @see https://github.com/quisquous/cactbot/blob/master/ui/oopsyraidsy/oopsyraidsy.js
// Character offsets into log lines for the chars of the type.
let kTypeOffset0 = 15;
let kTypeOffset1 = 16;

/*
Log Message Types (hex)
00 = game log
01 = zone change
03 = added combatant
04 = removed combatant
14 = starts casting
15 = single target (damage, skill)
16 = aoe (damage, skills, etc)
17 = cancelled/interrupted
18 = hot/dot tick
19 = was defeated by
1A = gains effect
1B = head marker
1E = loses effect
1F = meditate stacks?!
*/

// Fields for type=15/16 (decimal)
let kFieldType = 0;
let kFieldAttackerId = 1;
let kFieldAttackerName = 2;
let kFieldAbilityId = 3;
let kFieldAbilityName = 4;
let kFieldTargetId = 5;
let kFieldTargetName = 6;
let kFieldFlags = 7;
let kFieldDamage = 8;
// ??
let kFieldTargetCurrentHp = 23;
let kFieldTargetMaxHp = 24;
let kFieldTargetCurrentMp = 25;
let kFieldTargetMaxMp = 26;
let kFieldTargetCurrentTp = 27;
let kFieldTargetMaxTp = 28;
let kFieldTargetX = 29;
let kFieldTargetY = 30;
let kFieldTargetZ = 31;
// ??
let kFieldAttackerX = 38;
let kFieldAttackerY = 39;
let kFieldAttackerZ = 40;

var MESSAGE_TYPE_SINGLE_TARGET = 21;
var MESSAGE_TYPE_AOE = 22;
var MESSAGE_TYPE_DEATH = 25;

/**
 * Parse contents of log line and expand in to dictionary object.
 * @param {string} message 
 * @return object
 */
function parseLogLine(message)
{
    var fields = message.substr(15).split(":");
    var messageType = parseInt(fields[kFieldType], 16);
    var data = {
        "raw"                   : message,
        "type"                  : messageType,
    };
    switch (messageType)
    {
        case MESSAGE_TYPE_SINGLE_TARGET:
        case MESSAGE_TYPE_AOE:
        {
            data["sourceId"] = parseInt(fields[kFieldAttackerId], 16);
            data["sourceName"] = fields[kFieldAttackerName];
            data["actionId"] = parseInt(fields[kFieldAbilityId], 16);
            data["actionName"] = fields[kFieldAbilityName];
            data["targetId"] = parseInt(fields[kFieldTargetId], 16);
            data["targetName"] = fields[kFieldTargetName];
            data["flags"] = parseInt(fields[kFieldFlags], 16);
            data["damage"] = DamageFromFields(fields);
            break;
        }
        case MESSAGE_TYPE_DEATH:
        {
            var offset = kTypeOffset0 + 3;
            var defeatedIdx = message.indexOf(' was defeated');
            if (defeatedIdx == -1) {
                return;
            }
            let name = message.substr(offset, defeatedIdx - offset);            
            data["sourceName"] = name;
            break;
        }
    }
    return data;
}

/**
 * @see https://github.com/quisquous/cactbot/blob/master/ui/oopsyraidsy/oopsyraidsy.js#L261
 */
function DamageFromFields(fields) {
    let field = fields[kFieldDamage];
    let len = field.length;
    if (len <= 4)
        return 0;
    // Get the left two bytes as damage.
    let damage = parseInt(field.substr(0, len - 4), 16);
    // Check for third byte == 0x40.
    if (field[len - 4] == '4') {
        // Wrap in the 4th byte as extra damage.  See notes above.
        let rightDamage = parseInt(field.substr(len - 2, 2), 16);
        damage = damage - rightDamage + (rightDamage << 16);
    }
    return damage;
}