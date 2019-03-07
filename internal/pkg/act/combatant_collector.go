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

package act

// CombatantCollector - Combatant data collector
type CombatantCollector struct {
	Combatants []Combatant
}

// NewCombatantCollector - create new combatant collector
func NewCombatantCollector() CombatantCollector {
	cc := CombatantCollector{}
	cc.Reset()
	return cc
}

// Reset - reset combatant collector
func (c *CombatantCollector) Reset() {
	c.Combatants = make([]Combatant, 0)
}

// getCombatant - Get combatant
func (c *CombatantCollector) getCombatant(name string) *Combatant {
	for index := range c.Combatants {
		if c.Combatants[index].Name == name {
			return &c.Combatants[index]
		}
	}
	newCombatant := Combatant{
		Name: name,
	}
	c.Combatants = append(c.Combatants, newCombatant)
	return &c.Combatants[len(c.Combatants)-1]
}

// ReadLogLine - Parse log line and update combatant(s)
func (c *CombatantCollector) ReadLogLine(l *LogLineData) {
	switch l.Type {
	case LogTypeSingleTarget:
	case LogTypeAoe:
		{
			// get combatants involved
			aCombatant := c.getCombatant(l.AttackerName)
			tCombatant := c.getCombatant(l.TargetName)
			// update damage
			if l.HasFlag(LogFlagDamage) && l.Damage > 0 {
				aCombatant.Damage += int32(l.Damage)
				aCombatant.Hits++
				tCombatant.DamageTaken += int32(l.Damage)
			} else if l.HasFlag(LogFlagHeal) && l.Damage > 0 {
				aCombatant.DamageHealed += int32(l.Damage)
				aCombatant.Heals++
			}

		}
	}
}
