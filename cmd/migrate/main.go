package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"xrdb_rewrite/internal/migrate"
)

func main() {
	inputPath := flag.String("input", "", "path to legacy profiles json (array or {\"profiles\": [...]})")
	outputPath := flag.String("output", "output/migration/migrated-profiles.json", "path to migrated profile output json")
	reportPath := flag.String("report", "output/migration/migration-report.json", "path to migration report json")
	validateOnly := flag.Bool("validate-only", false, "run migration validation and report generation without writing migrated output")
	flag.Parse()

	if *inputPath == "" {
		exitWithErr("input is required")
	}

	raw, err := os.ReadFile(*inputPath)
	if err != nil {
		exitWithErr(fmt.Sprintf("failed to read input: %v", err))
	}

	envelope, err := migrate.ParseLegacyEnvelope(raw)
	if err != nil {
		exitWithErr(fmt.Sprintf("failed to parse input: %v", err))
	}

	profiles, report, err := migrate.MigrateLegacyProfiles(envelope, *inputPath, time.Now())
	if err != nil {
		exitWithErr(fmt.Sprintf("migration failed: %v", err))
	}

	if err := writeJSON(*reportPath, report); err != nil {
		exitWithErr(fmt.Sprintf("failed to write report: %v", err))
	}

	if !*validateOnly {
		if err := writeJSON(*outputPath, profiles); err != nil {
			exitWithErr(fmt.Sprintf("failed to write migrated output: %v", err))
		}
	}

	fmt.Printf("migration completed: input=%d migrated=%d unsupported=%d\n", report.InputProfiles, report.MigratedProfiles, len(report.UnsupportedFields))
	fmt.Printf("report: %s\n", *reportPath)
	if !*validateOnly {
		fmt.Printf("output: %s\n", *outputPath)
	}
}

func writeJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func exitWithErr(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}
