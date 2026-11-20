import { Composition } from 'remotion';
import { PinguDemo, TOTAL } from './PinguDemo';

export const Root = () => (
  <>
    <Composition id="PinguDemo" component={PinguDemo} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    {/* 1:1 cut for the LinkedIn feed */}
    <Composition id="PinguDemoSquare" component={PinguDemo} defaultProps={{ square: true }}
      durationInFrames={TOTAL} fps={30} width={1080} height={1080} />
  </>
);
