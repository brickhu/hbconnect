/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import { WalletProvider } from "arwallet-solid-kit"
import WanderStrategy from "@arweave-wallet-kit/wander-strategy"
import App from './App.jsx'


const root = document.getElementById('root')

render(() => <WalletProvider config={{
      permissions: [
        "ACCESS_ADDRESS","SIGN_TRANSACTION","DISPATCH","ACCESS_PUBLIC_KEY",
      ],
      appInfo :{
        name : "EarlyBirds"
      },
      ensurePermissions: true,
      strategies: [
        new WanderStrategy()
      ]
    }}>
      <App />
    </WalletProvider>, root)
