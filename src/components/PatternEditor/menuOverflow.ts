export interface ScrollMeasure {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export interface ScrollFade {
  top: boolean;
  bottom: boolean;
}

export function computeScrollFade(m: ScrollMeasure): ScrollFade {
  return {
    top: m.scrollTop > 1,
    bottom: m.scrollTop + m.clientHeight < m.scrollHeight - 1,
  };
}
