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
	"time"

	"../act"
)

// FindPlayerStats - player stats for given zone
func FindPlayerStats(zone string, db *sql.DB, playerStats *[]act.PlayerStat) error {
	// build query
	dbQueryStr := `
	SELECT DISTINCT encounter.compare_hash, player_id FROM combatant
	INNER JOIN encounter ON encounter.uid = encounter_uid
	WHERE hits >= 0 AND encounter.compare_hash != "" AND encounter.success_level = 1 AND zone = ?
	ORDER by DATETIME(combatant.time) DESC
	`
	// execute query
	rows, err := db.Query(
		dbQueryStr,
		zone,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		compareHash := ""
		playerID := 0
		err := rows.Scan(
			&compareHash,
			&playerID,
		)
		if err != nil {
			return err
		}
		subDbQueryStr := `
			SELECT job, combatant.damage, damage_taken, damage_healed, deaths, hits, heals, kills, encounter_uid,
			encounter.start_time, encounter.end_time, player.name, player.world_name FROM combatant
			INNER JOIN encounter ON encounter.uid = encounter_uid
			INNER JOIN player ON player.id = player_id
			WHERE encounter.compare_hash = ? AND player_id = ? LIMIT 1
		`
		subRows, err := db.Query(
			subDbQueryStr,
			compareHash,
			playerID,
		)
		if err != nil {
			return err
		}
		defer subRows.Close()
		for subRows.Next() {
			combatant := act.Combatant{
				Player: act.Player{
					ID: int32(playerID),
				},
			}
			encounter := act.Encounter{
				CompareHash: compareHash,
				Zone:        zone,
			}
			var worldName sql.NullString
			err := subRows.Scan(
				&combatant.Job,
				&combatant.Damage,
				&combatant.DamageTaken,
				&combatant.DamageHealed,
				&combatant.Deaths,
				&combatant.Hits,
				&combatant.Heals,
				&combatant.Kills,
				&encounter.UID,
				&encounter.StartTime,
				&encounter.EndTime,
				&combatant.Player.Name,
				&worldName,
			)
			if err != nil {
				return err
			}
			if worldName.Valid {
				combatant.Player.World = worldName.String
			}
			combatant.EncounterUID = encounter.UID
			encounterTime := encounter.EndTime.Sub(encounter.StartTime)
			playerStat := act.PlayerStat{
				Combatant: combatant,
				Encounter: encounter,
				DPS:       float64(combatant.Damage) / float64(encounterTime/time.Second),
				HPS:       float64(combatant.DamageHealed) / float64(encounterTime/time.Second),
			}
			*playerStats = append(*playerStats, playerStat)
		}
		subRows.Close()
	}
	return nil
}
