package atomicfile

import (
	"bytes"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// A reader racing a rewrite sees one whole version or the other.
func TestAConcurrentReaderNeverSeesAPartialWrite(t *testing.T) {
	path := filepath.Join(t.TempDir(), "x.bin")
	a, b := bytes.Repeat([]byte{'a'}, 1<<20), bytes.Repeat([]byte{'b'}, 1<<20)
	if err := WriteFile(path, a, 0o644); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	stop := make(chan struct{})
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			default:
			}
			data := a
			if i%2 == 1 {
				data = b
			}
			if err := WriteFile(path, data, 0o644); err != nil {
				t.Error(err)
				return
			}
		}
	}()
	for range 300 {
		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, a) && !bytes.Equal(got, b) {
			close(stop)
			wg.Wait()
			t.Fatalf("read %d bytes that match neither version", len(got))
		}
	}
	close(stop)
	wg.Wait()
	matches, _ := filepath.Glob(filepath.Join(filepath.Dir(path), "*.tmp"))
	if len(matches) != 0 {
		t.Errorf("left temporary files behind: %v", matches)
	}
}
