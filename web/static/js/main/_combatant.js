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

/**
 * Collects all combatants.
 */
class CombatantCollector
{

    constructor()
    {
        this.reset();
    }

    reset()
    {
        this.combatants = [];
    }

    /**
     * Add or update combatant.
     * @param {object} data 
     * @return {Combatant|null}
     */
    update(data)
    {
        // must have a name
        if (typeof(data.Name) == "undefined" || !data.Name) {
            return null;
        }
        // update
        var combatant = this.find(data);
        if (combatant) {
            combatant.update(data);
            return combatant;
        }
        // new
        combatant = new Combatant();
        combatant.update(data);
        this.combatants.push(combatant);
        return combatant;
    }

    /**
     * Find combatant.
     * @param {mixed} data 
     * @return {Combatant|null}
     */
    find(data)
    {
        for (var i in this.combatants) {
            if (this.combatants[i].compare(data)) {
                return this.combatants[i];
            }
        }
        return null;
    }

    /**
     * Get total damage for combatant, combining all child combatants.
     * @param {Combatant} combatant 
     * @return float
     */
    getCombatantTotalDamage(combatant)
    {
        var damage = combatant.data.Damage;
        for (var i in this.combatants) {
            if (combatant.compare(parseInt(this.combatants[i].data.ParentID))) {
                damage += this.combatants[i].data.Damage;
            }
        }
        if (!this._isValidParseNumber(damage)) {
            damage = 0;
        }
        return damage;
    }

    /**
     * Get total healing for combatant, combining all child combatants.
     * @param {Combatant} combatant 
     * @return float
     */    
    getCombatantTotalHealing(combatant)
    {
        var healing = combatant.data.DamageHealed;
        for (var i in this.combatants) {
            if (combatant.compare(parseInt(this.combatants[i].data.ParentID))) {
                healing += this.combatants[i].data.DamageHealed;
            }
        }
        if (!this._isValidParseNumber(healing)) {
            healing = 0;
        }
        return healing;        
    }

    /**
     * Check that number is valid number for parsing.
     * I.e. a real number that is a non negative
     * @param {numeric} value 
     */
    _isValidParseNumber(value)
    {
        return (
            !isNaN(value) &&
            isFinite(value) &&
            value >= 0
        );
    }

}

/**
 * Store information about a combatant.
 */
class Combatant
{

    constructor()
    {
        this.data = null;
        this.ids = [];
        this.names = [];
    }

    /**
     * Update combatant data with ACT data object.
     * @param {object} data 
     */
    update(data)
    {
        if (!this.data || data.Job || !this.data.Job) {
            this.data = data;
        }
        if (this.ids.indexOf(this.data.ID) == -1) {
            this.ids.push(this.data.ID);
        }
        if (this.names.indexOf(this.data.Name) == -1) {
            this.names.push(this.data.Name);
        }
    }

    /**
     * Determine if given value matches/represents this combatant.
     * @param {object|string|integer} value
     * @return boolean
     */
    compare(value)
    {
        if (!value) {
            return false;
        }
        return (
            // compare act object
            (
                typeof(value) == "object" &&
                (
                    (
                        typeof(value.data) != "undefined" && (
                            this.ids.indexOf(value.data.ID) != -1 ||
                            (
                                this.data.ParentID != 0 &&
                                this.data.ParentID == value.data.ParentID &&
                                this.names.indexOf(value.data.Name) != -1
                            )
                        )
                    ) ||
                    (
                        typeof(value.ID) != "undefined" && (
                            this.ids.indexOf(value.ID) != -1 ||
                            (
                                this.data.ParentID != 0 &&
                                this.data.ParentID == value.ParentID &&
                                this.names.indexOf(value.Name) != -1
                            )
                        )
                    )
                )
            // compare id or name
            ) ||
            (
                ["string", "number"].indexOf(typeof(value)) != -1 &&
                (
                    this.ids.indexOf(value) != -1 ||
                    this.names.indexOf(value) != -1
                )
            )
        );
    }

    /** 
     * Get combatant display name.
     * @return string
     */
    getDisplayName()
    {
        return this.data ? this.data.Name : "";
    }

    /**
     * Return true if this combatant is classified as an enemy.
     * @return bool
     */
    isEnemy()
    {
        // right now enemies are non pet combatants that do not have a defined job
        return this.data && this.data.ParentID == 0 && this.data.Job == "";
    }

    /**
     * Get value for given table column.
     * @param {string} name 
     * @return {string|float}
     */
    getTableCol(name)
    {
        switch(name) {
            case "name":
            {
                return this.getDisplayName();
            }
            case "job":
            {
                return this.data.Job.toLowerCase();
            }
            case "damage":
            {
                return this.data.Damage;
            }
            case "healing":
            {
                return this.data.DamageHealed;
            }
            case "deaths":
            {
                return this.data.Deaths;
            }
        }
        return "";
    }

}