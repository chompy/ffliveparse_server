
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

// If kFieldFlags is any of these values, then consider field 9/10 as 7/8.
// It appears a little bit that flags come in pairs of values, but it's unclear
// what these mean.
let kShiftFlagValues = ['3E', '113', '213', '313'];
let kFlagInstantDeath = '33';
// miss, damage, block, parry, instant death
let kAttackFlags = ['01', '03', '05', '06', kFlagInstantDeath];

var MESSAGE_TYPE_SINGLE_TARGET = 21;
var MESSAGE_TYPE_AOE = 22;
var MESSAGE_TYPE_DEATH = 25;
var MESSAGE_TYPE_GAIN_EFFECT = 26;
var MESSAGE_TYPE_LOSE_EFFECT = 30;

var LOG_LINE_FLAG_DODGE = "dodge";
var LOG_LINE_FLAG_HEAL = "heal";
var LOG_LINE_FLAG_DAMAGE = "damage";
var LOG_LINE_FLAG_CRIT = "crit";
var LOG_LINE_FLAG_DIRECT_HIT = "direct-hit";
var LOG_LINE_FLAG_GAIN_EFFECT = "gain-effect";
var LOG_LINE_FLAG_LOSE_EFFECT = "lose-effect";
var LOG_LINE_FLAG_DEATH = "death";

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

            // Shift damage and flags forward for mysterious spurious :3E:0:.
            // Plenary Indulgence also appears to prepend confession stacks.
            // UNKNOWN: Can these two happen at the same time?
            if (kShiftFlagValues.indexOf(fields[kFieldFlags]) >= 0) {
                fields[kFieldFlags] = fields[kFieldFlags + 2];
                fields[kFieldFlags + 1] = fields[kFieldFlags + 3];
            }

            data["sourceId"] = parseInt(fields[kFieldAttackerId], 16);
            data["sourceName"] = fields[kFieldAttackerName];
            data["actionId"] = parseInt(fields[kFieldAbilityId], 16);
            data["actionName"] = fields[kFieldAbilityName];
            data["targetId"] = parseInt(fields[kFieldTargetId], 16);
            data["targetName"] = fields[kFieldTargetName];
            data["damage"] = DamageFromFields(fields);
            data["targetCurrentHp"] = fields[kFieldTargetCurrentHp];
            data["targetMaxHp"] = fields[kFieldTargetMaxHp];
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
    // flags
    data["flags"] = [];
    if (fields.length >= kFieldFlags && typeof(fields[kFieldFlags]) != "undefined") {
        var rawFlags = fields[kFieldFlags];
        // damage
        switch (rawFlags.substring(rawFlags.length - 1, rawFlags.length))
        {
            case "1":
            {
                data.flags.push(LOG_LINE_FLAG_DODGE);
                break;
            }
            case "3":
            {
                switch (rawFlags.substring(rawFlags.length - 2, rawFlags.length - 1))
                {
                    case "3":
                    {
                        //data.flags.push("instant-death");
                        break;
                    }
                    default:
                    {
                        data.flags.push(LOG_LINE_FLAG_DAMAGE);
                        if (rawFlags.length >= 3) {
                            switch(rawFlags.substring(rawFlags.length - 3, rawFlags.length - 2))
                            {
                                case "1":
                                {
                                    data.flags.push(LOG_LINE_FLAG_CRIT);
                                    break;
                                }
                                case "2":
                                {
                                    data.flags.push(LOG_LINE_FLAG_DIRECT_HIT);
                                    break;
                                }
                                case "3":
                                {
                                    data.flags.push(LOG_LINE_FLAG_CRIT);
                                    data.flags.push(LOG_LINE_FLAG_DIRECT_HIT);
                                    break;
                                }
                            }
                        }
                        break;
                    }
                }                
                break;
            }
            case "4":
            {
                data.flags.push(LOG_LINE_FLAG_HEAL);
                if (rawFlags.length >= 5 && rawFlags.substring(rawFlags.length - 5, rawFlags.length - 4) == "1") {
                    data.flags.push(LOG_LINE_FLAG_CRIT);
                }
                break;
            }
            case "5":
            {
                //data.flags.push("blocked-damage");
                break;
            }
            case "6":
            {
                //data.flags.push("parried-damage");
                break;
            }
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