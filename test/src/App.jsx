import { createSignal } from 'solid-js'
import solidLogo from './assets/solid.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { useWallet } from "arwallet-solid-kit";
import {HB} from "hbconnect"
let PID = "qXfjf5moWMg8Rs-H7H4MmXPeeMwjGYcl5_vRwNCw9D0"
// let PID = "XpEyX_4VJRCo7V6z4hLIpGiAGsVVMNwOUyRwj3DRyzE"
let HB_URL = "http://node.arweaveoasis.com:8734"

function App() {
  const { connected, address, connecting, showConnector,wallet } = useWallet()
  const [loading,setLoading] = createSignal(false)
  const [result, setResult] = createSignal()
  const [error,setError] = createSignal()
  const [process,setProcess] = createSignal(PID)
  const handle_get_sechecher = async()=>{
    try {
      setLoading(true)
      let hb = new HB({
        url: HB_URL,
        wallet : wallet()
      })
      // console.log('hb: ', hb);
      const sechecher = await hb.getScheduler()
      console.log('sechecher: ', sechecher);
      if(sechecher){
        setResult(sechecher)
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }
  const handle_fetch = async() => {
    try {
      setLoading(true)
      const path = `/${process()}~process@1.0/now/cache`
      const {body} = await new HB({url : HB_URL}).fetch(path,{
        method : "GET",
        headers : {
          "Accept": "application/json",
          "Accept-bundle" : "true"
        }
      }).then(res=>res?.ok && res.json())
      console.log('result: ', body);
      if(body){
        setResult(JSON.stringify(body))
        setError(null)
      }else{
        throw new Error("500")
      }
    } catch (error) {
      setResult(null)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }
  const handle_reslut = async() => {
    try {
      setLoading(true)
      const {body} = await new HB({url : HB_URL}).result({
        process : process(),
        slot : "1"
      })
      console.log("handle_reslut : ",body)
      if(body) {
        setError(null)
        setResult(JSON.stringify(body))
      }
    } catch (error) {
      setResult(null)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handle_send = async() => {
    try {
      setLoading(true)
      let pid = process()
      const hb = new HB({
        url : HB_URL,
        wallet : wallet()
      })
      const res = await hb.send(pid,{
        Action : "Test2"
      },"1986",wallet())
      console.log(res)
      if(res?.id){
        setResult(res?.id)
        setError(null)
      }
    } catch (error) {
      setResult(null)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handle_spawn = async() => {
    try {
      setLoading(true)
      const hb = new HB({
        url : HB_URL,
        wallet : wallet()
      })
      const result = await hb.spawn("Test89","2025")
      if(result){
        console.log('result: ', result);
        setProcess(result)
        setResult(`Spawned : ${result}`)
        setError(null)
      }
    } catch (error) {
      setResult(null)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }
  const handle_get_authority = async () => {
    const result = await new HB({url : HB_URL}).getAuthority()
    console.log('result: ', result);
  }
  return (
    <>

      <h1>hbconnect</h1>
      <div class="card" >
         <Show when={connected()} fallback={
          <button onClick={showConnector} disabled={connecting()}>{connecting()?"connecting" : "connect"}</button>
        }>
          <button onClick={handle_get_sechecher}>
            Get Sechecher
          </button>

          <button onClick={handle_fetch}>
            Fetch
          </button>
          <button onClick={handle_reslut}>
            Result
          </button>
          <button onClick={handle_send}>
            Send
          </button>
           <button onClick={handle_get_authority}>
            Get Authority
          </button>
          <button onClick={handle_spawn}>
            Spawn
          </button>
        </Show>
        
        <div>
          <Show when={!loading()} fallback={"loading..."}>
            <h2>result:</h2>
            <p>{result() || "null"}</p>
            <h2>error:</h2>
            <p classList={{"error" : error()}}>{error() || "null"}</p>
          </Show>
        </div>
      </div>
      <div className='read-the-doc'>
        <hr/>
        <ul>
          <li>address : {address()}</li>
          <li>pid : {process()}</li>
          <li>url : {HB_URL}</li>
        </ul>
      </div>
    </>
  )
}

export default App
