/*! Vue 3 composable for PrintBridge. import { usePrintBridge } from 'printbridge-client/src/vue.js' */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import PrintBridge from './printbridge.js';

export function usePrintBridge(options = {}) {
  const connected = ref(false);
  const printers = ref([]);
  const error = ref(null);

  const onConnect = async () => {
    connected.value = true;
    try { printers.value = await PrintBridge.printers.list(); } catch (e) { error.value = e.message; }
  };
  const onDisconnect = () => { connected.value = false; };

  async function connect() {
    error.value = null;
    try { await PrintBridge.connect(options.connect || (typeof window !== 'undefined' && window.PRINTBRIDGE_CONFIG && window.PRINTBRIDGE_CONFIG.connect) || {}); }
    catch (e) { error.value = e.message; throw e; }
  }

  /** Print a job returned from Laravel's PrintBridge::job()->toArray() ({ config, data }). */
  function printJob(job) { return PrintBridge.print(job.config, job.data); }

  onMounted(() => {
    PrintBridge.on('connect', onConnect).on('disconnect', onDisconnect);
    if (options.autoConnect !== false) connect().catch(() => {});
  });
  onBeforeUnmount(() => { PrintBridge.off('connect', onConnect).off('disconnect', onDisconnect); });

  return { pb: PrintBridge, connected, printers, error, connect, printJob, print: PrintBridge.print, escpos: PrintBridge.escpos };
}

export { PrintBridge };
export default usePrintBridge;
