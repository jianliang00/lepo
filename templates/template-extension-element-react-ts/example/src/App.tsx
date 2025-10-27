import { useCallback, useEffect, useState } from '@lynx-js/react'

import './App.css'

import {Button} from '{{componentName}}';

import lynxLogo from './assets/lynx-logo.png'
import reactLynxLogo from './assets/react-logo.png'

export function App() {
  const [alterLogo, setAlterLogo] = useState(false)

  useEffect(() => {
    console.info('Hello, ReactLynx')
  }, [])

  const onTap = useCallback(() => {
    'background only'
    setAlterLogo(!alterLogo)
  }, [alterLogo])

  return (
    <view>
      <view className='Background' />
      <view className='App'>
        <view className='Banner'>
          <view bindtap={onTap} className='Logo'>
            {alterLogo
              ? <image className='Logo--react' src={reactLynxLogo} />
              : <image className='Logo--lynx' src={lynxLogo} />}
          </view>
          <text className='Title'>React</text>
          <text className='Subtitle'>on Lynx</text>
        </view>
        <view className='Content'>
          <Button label="Click" onClick={onTap} primary={true} />
          <text className='Description'>Tap the button and have fun!</text>
          <text className='Hint'>
            Edit<text style={{ fontStyle: 'italic' }}>{' src/App.tsx '}</text>
            to see updates!
          </text>
        </view>
        <view style={{ flex: 1 }}></view>
      </view>
    </view>
  )
}
