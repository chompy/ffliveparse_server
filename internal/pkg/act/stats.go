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

import (
	"log"
	"sort"
	"time"

	"../app"

	"github.com/olebedev/emitter"
)

// StatTrackerZones - list of zones to track stats for
var StatTrackerZones = []string{
	"Eden's Gate: Resurrection (Savage)",
	"Eden's Gate: Descent (Savage)",
	"Eden's Gate: Inundation (Savage)",
	"Eden's Gate: Sepulture (Savage)",
	"Eden's Gate: Resurrection",
	"Eden's Gate: Descent",
	"Eden's Gate: Inundation",
	"Eden's Gate: Sepulture",
	"The Dancing Plague (Extreme)",
	"The Crown Of The Immaculate (Extreme)",
}

// PlayerStat - stat data for single player in single encounter
type PlayerStat struct {
	Encounter Encounter
	Combatant Combatant
	DPS       float64
	HPS       float64
}

// ZoneStats - global stats for specific zone
type ZoneStats struct {
	Zone    string
	Players []PlayerStat
}

// StatsTracker - track global stats
type StatsTracker struct {
	ZoneStats []ZoneStats
	events    *emitter.Emitter
}

// NewStatsTracker - create new stats tracker
func NewStatsTracker(events *emitter.Emitter) StatsTracker {
	return StatsTracker{
		ZoneStats: make([]ZoneStats, 0),
		events:    events,
	}
}

func (st *StatsTracker) collect() {
	log.Println("[PLAYER-STATS] Collect global player stats...")
	// reset zone stats
	st.ZoneStats = make([]ZoneStats, 0)
	// itterate raid zones
	for _, zone := range StatTrackerZones {
		playerStats := make([]PlayerStat, 0)
		fin := make(chan bool)
		st.events.Emit(
			"database:find",
			fin,
			&playerStats,
			zone,
		)
		<-fin
		zoneStats := ZoneStats{
			Players: playerStats,
			Zone:    zone,
		}
		st.ZoneStats = append(st.ZoneStats, zoneStats)
	}
	log.Println("[PLAYER-STATS] Done.")
}

// Start - start the stats tracker
func (st *StatsTracker) Start() error {
	log.Println("[PLAYER-STATS] Start global stat tracker.")
	st.collect()
	for range time.Tick(app.StatTrackerRefreshRate * time.Millisecond) {
		st.collect()
	}
	return nil
}

// GetZoneStats - get global player stats for specific zone
func (st *StatsTracker) GetZoneStats(zone string, job string, sortStat string) []*PlayerStat {
	playerStats := make([]*PlayerStat, 0)
	for index := range st.ZoneStats {
		if st.ZoneStats[index].Zone == zone {
			// collect player stats
			for playerIndex := range st.ZoneStats[index].Players {
				if job == "" || st.ZoneStats[index].Players[playerIndex].Combatant.Job == job {
					playerStats = append(playerStats, &st.ZoneStats[index].Players[playerIndex])
				}
			}
			// sort stats
			sort.Slice(
				playerStats,
				func(i, j int) bool {
					switch sortStat {
					case "dps":
						{
							return playerStats[i].DPS < playerStats[j].DPS
						}
					case "hps":
						{
							return playerStats[i].HPS < playerStats[j].HPS
						}
					case "damage":
						{
							return playerStats[i].Combatant.Damage < playerStats[j].Combatant.Damage
						}
					case "healing":
						{
							return playerStats[i].Combatant.DamageHealed < playerStats[j].Combatant.DamageHealed
						}
					}
					return true
				},
			)
			break
		}
	}
	return playerStats
}
