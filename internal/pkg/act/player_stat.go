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
	"bufio"
	"os"
	"sort"
	"strings"
	"time"

	"../app"
	"../data"
	"../storage"

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

// StatsTracker - track global stats
type StatsTracker struct {
	PlayerStats []data.PlayerStat `json:"players"`
	events      *emitter.Emitter
	storage     *storage.Manager
	log         app.Logging
}

// NewStatsTracker - create new stats tracker
func NewStatsTracker(sm *storage.Manager) StatsTracker {
	return StatsTracker{
		PlayerStats: make([]data.PlayerStat, 0),
		storage:     sm,
		log:         app.Logging{ModuleName: "PLAYER-STATS"},
	}
}

func (st *StatsTracker) collect() {
	st.log.Start("Start player stat collection.")
	// collect all player stats
	playerStats, _, err := st.storage.Fetch(map[string]interface{}{
		"type": storage.StoreTypePlayerStat,
	})
	if err != nil {
		st.log.Error(err)
		return
	}
	// get ban list
	banEncounterUids := make([]string, 0)
	if banFile, err := os.Open(app.GlobalStatBanPath); err == nil {
		defer banFile.Close()
		scanner := bufio.NewScanner(banFile)
		for scanner.Scan() {
			banLine := strings.TrimSpace(scanner.Text())
			if banLine == "" || banLine[0] == '#' {
				continue
			}
			banEncounterUids = append(banEncounterUids, banLine)
		}
	}
	// compile player stats with bans enacted
	st.PlayerStats = make([]data.PlayerStat, 0)
	for _, stat := range playerStats {
		hasBan := false
		for _, banEncounterUID := range banEncounterUids {
			if banEncounterUID == stat.(data.PlayerStat).Encounter.UID {
				hasBan = true
				break
			}
		}
		if !hasBan {
			st.PlayerStats = append(st.PlayerStats, stat.(data.PlayerStat))
		}
	}
	st.log.Finish("Finish player stat collection.")
}

// Start - start the stats tracker
func (st *StatsTracker) Start() error {
	st.log.Log("Start player stat tracker.")
	st.collect()
	for range time.Tick(app.StatTrackerRefreshRate * time.Millisecond) {
		st.collect()
	}
	return nil
}

// GetZoneStats - get global player stats for specific zone
func (st *StatsTracker) GetZoneStats(zone string, jobs string, sortStat string) []*data.PlayerStat {
	// itterate player stats and filter
	playerStats := make([]*data.PlayerStat, 0)
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
