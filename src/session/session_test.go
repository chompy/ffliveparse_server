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

package session

import (
	"compress/gzip"
	"io"
	"os"
	"testing"
	"time"

	"../data"
)

const logLineAttack = "[11:02:11.617] 15:4000B744:Rhitahtyn sas Arvina:366:Attack:106CB0ED:Minda Silva:710003:3880000:0:0:0:0:0:0:0:0:0:0:0:0:0:0:85041:85041:9600:10000:0:1000:-696.0057:-817.2678:65.7804:-2.090146:140279:140279:8010:8010:0:1000:-701.6327:-819.8078:66.75428:1.188309:00002584"
const logLineBroil = "[11:02:17.092] 15:106CB0ED:Minda Silva:409D:Broil III:4000B744:Rhitahtyn sas Arvina:750103:65950000:1C:409D8000:0:0:0:0:0:0:0:0:0:0:0:0:109947:140279:8010:8010:0:1000:-697.5967:-818.204:65.92983:0.7683923:85041:85041:10000:10000:0:1000:-696.2116:-816.7462:65.75475:-2.381758:0000258D"
const logLineDefeat = "[11:02:31.874] 19:Rhitahtyn Sas Arvina was defeated by Minda Silva."
const logLineZone = "[11:02:42.562] 01:Changed Zone to The Lavender Beds."
const logLineEnd = "[11:02:42.562] 00:0038:end"
const logLineWow = "[21:52:50.000] 00:000e:Minda Silva:wowowo"

func TestEncounterTeamDefeat(t *testing.T) {
	e := NewEncounterManager(nil)

	ll1, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now().Add(time.Second),
			LogLine: logLineAttack,
		},
	)
	e.ReadLogLine(&ll1)

	llDefeat, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now().Add(time.Second * 5),
			LogLine: logLineDefeat,
		},
	)
	e.ReadLogLine(&llDefeat)

	e.Tick()
	if !e.IsWaitForTeamWipe() {
		t.Errorf("Should be waiting for time wipe timeout.")
	}
	// wait until team wipe time out
	time.Sleep(time.Second * 11)
	e.Tick()
	if e.GetEncounter().Active {
		t.Errorf("Encounter should be inactive after team wipe time out")
	}

}

func TestEncounterTeamRevive(t *testing.T) {
	e := NewEncounterManager(nil)
	llEnemyAtk, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now().Add(time.Second),
			LogLine: logLineAttack,
		},
	)
	e.ReadLogLine(&llEnemyAtk)
	// encounter should be active after an attack
	if !e.encounter.Active {
		t.Errorf("Encounter should be after after log line attack message.")
	}
	llEnemyDefeat, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now().Add(time.Second * 5),
			LogLine: logLineDefeat,
		},
	)
	e.ReadLogLine(&llEnemyDefeat)
	// after reading defeat log line it should be waiting
	// to team defeat timeout
	if !e.IsWaitForTeamWipe() {
		t.Errorf("Should be waiting for team wipe timeout.")
	}
	// should ignore a previous log line
	e.ReadLogLine(&llEnemyAtk)
	if !e.IsWaitForTeamWipe() {
		t.Errorf("Should be waiting for team wipe timeout. (After past log line sent.)")
	}
	// enemy attack log line that occurs after enemy defeat should revive the enemy
	llEnemyAtk.Time = time.Now().Add(time.Second * 6)
	e.ReadLogLine(&llEnemyAtk)
	e.Tick()
	if e.IsWaitForTeamWipe() {
		t.Errorf("Should no longer be waiting for team wipe timeout after team member revive.")
	}
	// old defeat message should be ignored
	e.ReadLogLine(&llEnemyDefeat)
	e.Tick()
	if e.IsWaitForTeamWipe() {
		t.Errorf("Should no longer be waiting for team wipe timeout after team member revive. (After past log line sent.)")
	}
}

func TestEncounterZoneChange(t *testing.T) {
	e := NewEncounterManager(nil)
	llAtk, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now(),
			LogLine: logLineAttack,
		},
	)
	e.ReadLogLine(&llAtk)
	encounterUID := e.GetEncounter().UID
	llZone, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now().Add(time.Second * 3),
			LogLine: logLineZone,
		},
	)
	e.ReadLogLine(&llZone)
	// should be inactive
	if e.GetEncounter().Active {
		t.Errorf("Encounter was still active after a zone change event.")
	}
	// performing a battle action before encounter ended should be ignored
	llAtk, _ = ParseLogLine(
		data.LogLine{
			Time:    time.Now().Add(-time.Second * 5),
			LogLine: logLineBroil,
		},
	)
	e.ReadLogLine(&llAtk)
	if e.GetEncounter().UID != encounterUID {
		t.Errorf("Encounter UID should not have changed after old attack event.")
	}
	// performing a battle action after encounter ended should start new encounter
	llAtk, _ = ParseLogLine(
		data.LogLine{
			Time:    time.Now().Add(time.Second * 10),
			LogLine: logLineBroil,
		},
	)
	e.ReadLogLine(&llAtk)
	if e.GetEncounter().UID == encounterUID {
		t.Errorf("Encounter UID should have changed after new attack event.")
	}
}

func TestEncounterEchoEnd(t *testing.T) {
	e := NewEncounterManager(nil)
	llAtk, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now(),
			LogLine: logLineBroil,
		},
	)
	e.ReadLogLine(&llAtk)
	llEnd, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now().Add(time.Second),
			LogLine: logLineEnd,
		},
	)
	e.ReadLogLine(&llEnd)
	if e.GetEncounter().Active {
		t.Errorf("Encounter should not be active after echo end event.")
	}
	if e.GetEncounter().SuccessLevel != EncounterSuccessEnd {
		t.Errorf("Invalid success level flag after echo end event.")
	}
}

func TestEncounterLength(t *testing.T) {
	e := NewEncounterManager(nil)
	llAtk, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now(),
			LogLine: logLineAttack,
		},
	)
	e.ReadLogLine(&llAtk)

	llBroil, _ := ParseLogLine(
		data.LogLine{
			Time:    time.Now().Add(time.Second),
			LogLine: logLineBroil,
		},
	)
	e.ReadLogLine(&llBroil)
	if e.GetEncounter().EndTime.Before(e.GetEncounter().StartTime) {
		t.Errorf("Encounter end time should be greater then start time.")
	}
}

func TestCombatant(t *testing.T) {
	c := NewCombatantManager()

	ca1 := data.Combatant{
		Player: data.Player{
			ID:      1,
			ActName: "Test Person",
			Name:    "Test Person",
		},
		ActEncounterID: 1,
		Time:           time.Now(),
		Damage:         10,
		Hits:           1,
	}
	ca2 := data.Combatant{
		Player: data.Player{
			ID:      1,
			ActName: "Test Person",
			Name:    "Test Person",
		},
		ActEncounterID: 1,
		Time:           time.Now().Add(time.Second * 5),
		Damage:         20,
		Hits:           2,
	}
	cb1 := data.Combatant{
		Player: data.Player{
			ID:      2,
			ActName: "Test Person2",
			Name:    "Test Person2",
		},
		ActEncounterID: 1,
		Time:           time.Now(),
		Damage:         50,
		Hits:           1,
	}
	cb2 := data.Combatant{
		Player: data.Player{
			ID:      2,
			ActName: "Test Person2",
			Name:    "Test Person2",
		},
		ActEncounterID: 2,
		Time:           time.Now().Add(time.Second * 5),
		Damage:         15,
		Hits:           1,
	}

	c.Update(ca1)
	c.Update(cb1)
	time.Sleep(time.Second * 4)
	c.Update(ca2)
	c.Update(cb2)

	combatants := c.GetCombatants()

	if len(combatants) != 4 {
		t.Errorf("Expect four combatants.")
	}
	if combatants[1].Damage != 20 {
		t.Errorf("Expected combatant 1 to have 20 total damage.")
	}
	if combatants[3].Damage != 65 {
		t.Errorf("Expected combatant 2 to have 65 total damage.")
	}

}

func TestLogLine(t *testing.T) {
	l := NewLogLineManager()
	defer l.Reset()
	ll1 := data.LogLine{
		Time:    time.Now(),
		LogLine: logLineBroil,
	}
	ll2 := data.LogLine{
		Time:    time.Now().Add(time.Second),
		LogLine: logLineDefeat,
	}
	ll3 := data.LogLine{
		Time:    time.Now().Add(time.Second * 2),
		LogLine: logLineWow,
	}
	l.Update(ll1)
	l.Update(ll2)
	l.Update(ll3) // should be ignored
	logLines, err := l.Dump()
	if err != nil {
		t.Errorf("Error occurred...%s", err)
	}
	if logLines[0].LogLine != ll1.LogLine || logLines[1].LogLine != ll2.LogLine {
		t.Errorf("Log lines in log line manager don't match.")
	}
	if len(logLines) != 2 {
		t.Errorf("Expect exactly two log lines in log line manager.")
	}
	logLines, err = l.GetLogLines(0)
	if err != nil {
		t.Errorf("Error occurred...%s", err)
	}
	if logLines[0].LogLine != ll1.LogLine || logLines[1].LogLine != ll2.LogLine {
		t.Errorf("Log lines in log line manager dump file don't match.")
	}
	// test 'dump' for a second time
	ll4 := data.LogLine{
		Time:    time.Now().Add(time.Second * 3),
		LogLine: logLineEnd,
	}
	l.Update(ll4)
	logLines, err = l.Dump()
	if err != nil {
		t.Errorf("Error occurred...%s", err)
	}
	if logLines[0].LogLine != ll4.LogLine {
		t.Errorf("Log lines in log line manager don't match.")
	}
	logLines, err = l.GetLogLines(0)
	if logLines[2].LogLine != ll4.LogLine {
		t.Errorf("Log lines in log line manager don't match.")
	}
	// test save
	l.SetEncounterUID("TEST_E1")
	l.SetSavePath(os.TempDir())
	err = l.Save()
	if err != nil {
		t.Errorf("Error occurred...%s", err)
	}
	// read save
	f, err := os.OpenFile(GetLogFilePath(os.TempDir(), "TEST_E1"), os.O_RDONLY, 0644)
	if err != nil {
		t.Errorf("Error occurred...%s", err)
	}
	gr, err := gzip.NewReader(f)
	if err != nil {
		t.Errorf("Error occurred...%s", err)
	}
	// read past first log line to ensure we can seek ahead
	buf := make([]byte, LogLineByteSize)
	_, err = io.ReadFull(gr, buf)
	if err != nil {
		t.Errorf("Error occurred...%s", err)
	}
	logLines, err = GetLogLinesFromReader(gr)
	if len(logLines) != 2 {
		t.Errorf("Log line save file has unexpected number of log lines.")
	}
	if logLines[0].LogLine != ll2.LogLine || logLines[1].LogLine != ll4.LogLine {
		t.Errorf("Log lines in log line save file don't match.")
	}
}
