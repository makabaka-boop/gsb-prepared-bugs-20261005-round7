<script lang="ts">
 import {tree} from '../chess/tree';
 let source=$state(1), target=$state(0), message=$state('');
 function move(){message=tree.transplant(source,target) ?? 'Branch moved';}
</script>
<section><h2>Move existing variation</h2>
<label>Branch root <input type="number" bind:value={source}/></label>
<label>New parent <input type="number" bind:value={target}/></label>
<button onclick={move}>Move subtree</button><p role="status">{message}</p></section>
