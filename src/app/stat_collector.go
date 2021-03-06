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

package app

import (
	"time"

	"github.com/olebedev/emitter"
)

// StatMaxSnapshots - Max number of snapshots to store in memory
const StatMaxSnapshots = 300

// StatSnapshotRate - Rate at which stat snapshots are created
const StatSnapshotRate = 1000 * 60

// StatSnapshot - snapshot of stats at a point in time
type StatSnapshot struct {
	Time        time.Time `json:"time"`
	PageLoads   int       `json:"page_loads"`
	LogLines    int64     `json:"log_lines"`
	Connections struct {
		Web map[int64]int `json:"web"`
		ACT map[int64]int `json:"act"`
	} `json:"connections"`
}

// StatCollector - global stat collector
type StatCollector struct {
	events    *emitter.Emitter
	Snapshots []StatSnapshot `json:"snapshots"`
	log       Logging
}

// NewStatCollector - create a new stat collector
func NewStatCollector(events *emitter.Emitter) StatCollector {
	s := StatCollector{
		events:    events,
		Snapshots: make([]StatSnapshot, 0),
		log:       Logging{ModuleName: "USAGE"},
	}
	return s
}

// Start - start stat collection
func (s *StatCollector) Start() {
	s.log.Log("Start stat collector.")
	for range time.Tick(StatSnapshotRate * time.Millisecond) {
		s.TakeSnapshot()
	}
}

// TakeSnapshot - take a new snapshot
func (s *StatCollector) TakeSnapshot() {
	s.log.Log("Snapshot.")
	if len(s.Snapshots) >= StatMaxSnapshots {
		s.Snapshots = s.Snapshots[len(s.Snapshots)-StatMaxSnapshots:]
	}
	snapshot := StatSnapshot{
		Time: time.Now(),
	}
	snapshot.Connections.ACT = map[int64]int{}
	snapshot.Connections.Web = map[int64]int{}
	s.Snapshots = append(s.Snapshots, snapshot)
	go s.events.Emit(
		"stat:snapshot",
		&s.Snapshots[len(s.Snapshots)-1],
	)
}
