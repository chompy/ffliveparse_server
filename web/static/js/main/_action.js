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

var GAIN_EFFECT_REGEX = "1A\:([A-F0-9]*)\:([a-zA-Z0-9` ']*) gains the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*) for ([0-9]*)\.00 Seconds\.";
var LOSE_EFFECT_REGEX = "1E\:([A-F0-9]*)\:([a-zA-Z0-9` ']*) loses the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*)\.";
var ACTION_TYPE_NORMAL = "normal";
var ACTION_TYPE_GAIN_STATUS_EFFECT = "gain-effect";
var ACTION_TYPE_LOSE_STATUS_EFFECT = "lose-effect";
var ACTION_TYPE_DEATH = "death";
var PET_NAMES = [
    "Eos", "Selene", "Seraph", "Garuda-Egi", "Titan-Egi", "Ifrit-Egi",
    "Emerald Carbuncle", "Topaz Carbuncle", "Ruby Carbuncle", "Demi-Bahamut",
    "Demi-Phoenix", "Rook Autoturret", "Bishop Autoturret", "Automaton Queen"
];

/**
 * Collects all actions.
 */
class ActionCollector
{
    /**
     * @param {CombatantCollector} combatantCollector 
     */
    constructor(combatantCollector)
    {
        this.reset();
        this.combatantCollector = combatantCollector;
        this.gainEffectRegex = new XRegExp(GAIN_EFFECT_REGEX);
        this.loseEffectRegex = new XRegExp(LOSE_EFFECT_REGEX);
    }

    reset()
    {
        this.actions = [];
    }

    /**
     * Add action from log line data.
     * @param {object} logLineEventDetail 
     * @return {Action|null}
     */
    add(logLineEventDetail)
    {
        var action = new Action();
        action.time = logLineEventDetail.Time;
        action.encounterUid = logLineEventDetail.EncounterUID;
        action.data = parseLogLine(logLineEventDetail.LogLine);
        switch (action.data.type)
        {
            case MESSAGE_TYPE_AOE:
            {
                var otherAoeActions = [];
                for (var i in this.actions) {
                    if (
                        this.actions[i].data.type == MESSAGE_TYPE_AOE &&
                        this.actions[i].time.getTime() == action.time.getTime() &&
                        this.actions[i].data.actionId >= 0 && this.actions[i].data.actionId == action.data.actionId &&
                        this.actions[i].data.actionName == action.data.actionName
                    ) {
                        otherAoeActions.push(this.actions[i]);
                        this.actions[i].relatedActions.push(action);
                    }
                }
                if (otherAoeActions.length > 0) {
                    action.displayAction = false;
                }
                action.data.relatedActions = otherAoeActions;
            }
            case MESSAGE_TYPE_SINGLE_TARGET:
            {
                action.type = ACTION_TYPE_NORMAL;
                break;
            }
            case MESSAGE_TYPE_DEATH:
            {
                action.type = ACTION_TYPE_DEATH;
                action.data.actionId = -1;
                action.data.actionName = "Death";
                action.data.sourceId = -1;
                action.data.targetId = -1;
                action.data.targetName = action.data.sourceName;
                break;
            }
            case MESSAGE_TYPE_GAIN_EFFECT:
            {
                var regexParse = this.gainEffectRegex.exec(action.data.raw);
                if (!regexParse) {
                    break;
                }
                action.type = ACTION_TYPE_GAIN_STATUS_EFFECT;
                var targetId = regexParse[1];
                var target = regexParse[2];
                var effect = regexParse[3];
                var source = regexParse[4];
                //var time = parseInt(regexParse[4]);
                action.data.actionId = -2;
                action.data.actionName = effect;
                action.data.sourceId = null;
                action.data.sourceName = source;
                action.data.targetId = targetId;
                action.data.targetName = target;
                action.data.flags = [LOG_LINE_FLAG_GAIN_EFFECT];
                break;
            }
            case MESSAGE_TYPE_LOSE_EFFECT:
            {
                var regexParse = this.loseEffectRegex.exec(action.data.raw);
                if (!regexParse) {
                    break;
                }
                action.type = ACTION_TYPE_LOSE_STATUS_EFFECT;
                var targetId = regexParse[1];
                var target = regexParse[2];
                var effect = regexParse[3];
                var source = regexParse[4];
                action.data.actionId = -3;
                action.data.actionName = effect;
                action.data.sourceId = null;
                action.data.sourceName = source;
                action.data.targetId = targetId;
                action.data.targetName = target;
                action.data.flags = [LOG_LINE_FLAG_LOSE_EFFECT];
                break;
            }
            default:
            {
                return null;
            }
        }
        // get performing combatant
        action.sourceCombatant = this.combatantCollector.find(
            action.data.sourceId
        );
        if (!action.sourceCombatant) {
            action.sourceCombatant = this.combatantCollector.find(
                action.data.sourceName
            );
        }
        // get target combatant
        action.targetCombatant = this.combatantCollector.find(
            action.data.targetId
        );
        if (!action.targetCombatant) {
            action.targetCombatant = this.combatantCollector.find(
                action.data.targetName
            );
        }
        this.actions.push(action);
        return action;
    }

    /**
     * Get subset of actions inside given offset and limit.
     * @param {integer} offset 
     * @param {integer} limit 
     * @return {array}
     */
    findByOffset(offset, limit)
    {
        var results = [];
        if (
            limit == 0 ||
            offset >= this.actions.length - 1
        ) {
            return results;
        }
        if (limit < 0) {
            limit = 9999999;
        }
        for (var i = offset; i < offset + limit; i++) {
            if (i >= this.actions.length) {
                break;
            }
            results.push(this.actions[i]);
        }
        return results;
    }

    /**
     * Get all actions in date/time range.
     * @param {Date} start 
     * @param {Date} end 
     * @return {array}
     */
    findInDateRange(start, end)
    {
        var results = [];
        for (var i in this.actions) {
            if (this.actions[i].time.getTime() > start.getTime() && this.actions[i].time.getTime() < end.getTime()) {
                results.push(this.actions[i]);
            }
        }
        return results;
    }

}

/**
 * Store data about an action that was used.
 */
class Action
{

    constructor()
    {
        // action time
        this.time = null;
        // encounter uid
        this.encounterUid = "";
        // type of action
        this.type = "";
        // combatant performing action
        this.sourceCombatant = null;
        // combatant who is target of action
        this.targetCombatant = null;
        // raw parse data for action
        this.data = null;
        // other actions related to this one
        // specifically used for aoes that have multiple targets
        this.relatedActions = [];
        // rather or not this action should be rendered in views that would
        // display it in some way (timeline, etc)
        this.displayAction = true;
    }

    /**
     * Check if action source is pet...use name from
     * list of known pet names to determine...not my
     * favorite approach but it's not really easy to determine.
     * @return {boolean}
     */
    sourceIsPet()
    {
        if (this.sourceIsPlayer() || !this.data || !this.data.sourceName) {
            return false;
        }
        return PET_NAMES.indexOf(this.data.sourceName) != -1;
    }

    /**
     * Check if action source is player.
     * @return {boolean}
     */
    sourceIsPlayer()
    {
        return Boolean(this.sourceCombatant);
    }


    /**
     * Check if action source is enemy. Use process of elimination
     * not player or pet.
     * @return {boolean}
     */
    sourceIsEnemy()
    {
        return !this.sourceIsPlayer() && !this.sourceIsPet();
    }

}
