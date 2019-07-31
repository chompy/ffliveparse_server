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

package database

import (
	"database/sql"

	"../act"
	"../user"
)

// FindPlayerStats - player stats for given zone
func FindPlayerStats(db *sql.DB, playerStats *[]act.PlayerStat) error {
	// build query
	dbQueryStr := `
	SELECT encounter.uid, encounter.compare_hash, encounter.zone, encounter.start_time, encounter.end_time,
	encounter.user_id, player.id, player.name, player.world_name,
	job, MAX(combatant.damage), combatant.damage_taken, combatant.damage_healed,
	combatant.deaths, combatant.hits, combatant.heals, combatant.kills FROM combatant
	INNER JOIN encounter ON encounter.uid = combatant.encounter_uid
	INNER JOIN player ON player.id = combatant.player_id
	WHERE combatant.hits > 0 AND combatant.time > 0 AND encounter.compare_hash != "" AND encounter.success_level = 1
	GROUP BY encounter.compare_hash, combatant.player_id
	`
	// execute query
	rows, err := db.Query(
		dbQueryStr,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		combatant := act.Combatant{
			Player: act.Player{},
		}
		encounter := act.Encounter{}
		var worldName sql.NullString
		userID := int64(0)
		err := rows.Scan(
			&encounter.UID,
			&encounter.CompareHash,
			&encounter.Zone,
			&encounter.StartTime,
			&encounter.EndTime,
			&userID,
			&combatant.Player.ID,
			&combatant.Player.Name,
			&worldName,
			&combatant.Job,
			&combatant.Damage,
			&combatant.DamageTaken,
			&combatant.DamageHealed,
			&combatant.Deaths,
			&combatant.Hits,
			&combatant.Heals,
			&combatant.Kills,
		)
		if err != nil {
			return err
		}
		if worldName.Valid {
			combatant.Player.World = worldName.String
		}
		combatant.EncounterUID = encounter.UID
		encounterTime := encounter.EndTime.Sub(encounter.StartTime)
		webIDStr, _ := user.GetWebIDStringFromID(userID)
		playerStat := act.PlayerStat{
			Combatant: combatant,
			Encounter: encounter,
			DPS:       float64(combatant.Damage) / float64(encounterTime.Seconds()),
			HPS:       float64(combatant.DamageHealed) / float64(encounterTime.Seconds()),
			URL:       "/" + webIDStr + "/" + encounter.UID,
		}
		*playerStats = append(*playerStats, playerStat)
	}
	return nil
}
