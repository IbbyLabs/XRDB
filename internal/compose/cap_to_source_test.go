package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/render"
)

func TestCapToSource(t *testing.T) {
	poster := render.Dimensions{Width: 780, Height: 1170}
	fourK := render.Dimensions{Width: 2340, Height: 3510}

	tests := []struct {
		name  string
		dim   render.Dimensions
		src   image.Rectangle
		floor render.Dimensions
		want  render.Dimensions
	}{
		{
			name:  "a source larger than the box is left alone",
			dim:   poster,
			src:   image.Rect(0, 0, 2000, 3000),
			floor: poster,
			want:  poster,
		},
		{
			name:  "a source exactly the box is left alone",
			dim:   poster,
			src:   image.Rect(0, 0, 780, 1170),
			floor: poster,
			want:  poster,
		},
		{
			name:  "4K against TMDB's largest poster caps to the source",
			dim:   fourK,
			src:   image.Rect(0, 0, 2000, 3000),
			floor: poster,
			want:  render.Dimensions{Width: 2000, Height: 3000},
		},
		{
			name:  "the binding axis decides when the aspect differs",
			dim:   fourK,
			src:   image.Rect(0, 0, 2000, 6000),
			floor: poster,
			want:  render.Dimensions{Width: 2000, Height: 3000},
		},
		{
			name:  "a source below the base size yields the base size",
			dim:   fourK,
			src:   image.Rect(0, 0, 300, 450),
			floor: poster,
			want:  poster,
		},
		{
			name:  "an empty source is left alone",
			dim:   fourK,
			src:   image.Rect(0, 0, 0, 0),
			floor: poster,
			want:  fourK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := capToSource(tc.dim, tc.src, tc.floor)
			if got != tc.want {
				t.Errorf("capToSource(%v, %v) = %v, want %v", tc.dim, tc.src.Size(), got, tc.want)
			}
		})
	}
}

// The point of the cap: the box it returns never asks resizeFit to scale up.
func TestCapToSourceNeverUpscales(t *testing.T) {
	fourK := render.Dimensions{Width: 2340, Height: 3510}
	poster := render.Dimensions{Width: 780, Height: 1170}

	for _, src := range []image.Rectangle{
		image.Rect(0, 0, 2000, 3000),
		image.Rect(0, 0, 1500, 2250),
		image.Rect(0, 0, 1000, 1500),
		image.Rect(0, 0, 950, 1426),
		image.Rect(0, 0, 1000, 4000),
	} {
		got := capToSource(fourK, src, poster)
		if got.Width > src.Dx() || got.Height > src.Dy() {
			t.Errorf("source %v capped to %v, which still upscales", src.Size(), got)
		}
	}
}
