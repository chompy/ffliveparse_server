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
	"strings"
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
	Encounter Encounter `json:"encounter"`
	Combatant Combatant `json:"combatant"`
	DPS       float64   `json:"dps"`
	HPS       float64   `json:"hps"`
	URL       string    `json:"url"`
}

// StatsTracker - track global stats
type StatsTracker struct {
	PlayerStats []PlayerStat `json:"players"`
	events      *emitter.Emitter
}

// NewStatsTracker - create new stats tracker
func NewStatsTracker(events *emitter.Emitter) StatsTracker {
	return StatsTracker{
		PlayerStats: make([]PlayerStat, 0),
		events:      events,
	}
}

func (st *StatsTracker) collect() {
	startTime := time.Now()
	log.Println("[PLAYER-STATS] Collect global player stats...")
	// collect all player stats
	playerStats := make([]PlayerStat, 0)
	fin := make(chan bool)
	st.events.Emit(
		"database:find",
		fin,
		&playerStats,
	)
	<-fin
	st.PlayerStats = playerStats
	log.Println("[PLAYER-STATS] Done (", time.Now().Sub(startTime), ")")
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
func (st *StatsTracker) GetZoneStats(zone string, jobs string, sortStat string) []*PlayerStat {
	// itterate player stats and filter
	playerStats := make([]*PlayerStat, 0)
	for index := range st.PlayerStats {
		if st.PlayerStats[index].Encounter.Zone == zone && (jobs == "" || strings.Contains(jobs, st.PlayerStats[index].Combatant.Job)) {
			playerStats = append(playerStats, &st.PlayerStats[index])
		}
	}
	// sort stats
	sort.Slice(
		playerStats,
		func(i, j int) bool {
			switch sortStat {
			case "dps":
				{
					return playerStats[i].DPS > playerStats[j].DPS
				}
			case "hps":
				{
					return playerStats[i].HPS > playerStats[j].HPS
				}
			case "speed":
				{
					return playerStats[i].Encounter.EndTime.Sub(playerStats[i].Encounter.StartTime) <
						playerStats[j].Encounter.EndTime.Sub(playerStats[j].Encounter.StartTime)
				}
			case "time":
				{
					return playerStats[i].Encounter.EndTime.Before(playerStats[j].Encounter.EndTime)
				}
			case "damage":
				{
					return playerStats[i].Combatant.Damage > playerStats[j].Combatant.Damage
				}
			case "healing":
				{
					return playerStats[i].Combatant.DamageHealed > playerStats[j].Combatant.DamageHealed
				}
			}
			return true
		},
	)

	return playerStats
}
