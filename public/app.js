const $ = s => document.querySelector(s);
let selectedFiles = [];
let report = null;
const loginBox = $("#login"), appBox = $("#app");
async function refreshSession(){
  const r=await fetch("/api/session"); const d=await r.json();
  loginBox.classList.toggle("hidden",d.authenticated); appBox.classList.toggle("hidden",!d.authenticated);
  $("#logout").classList.toggle("hidden",!d.authenticated);
}
$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("#loginError").textContent="";
  const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("#password").value})});
  const d=await r.json(); if(!r.ok){$("#loginError").textContent=d.error||"Falha no acesso.";return}
  $("#password").value=""; await refreshSession();
});
$("#logout").addEventListener("click",async()=>{await fetch("/api/logout",{method:"POST"});report=null;$("#results").classList.add("hidden");await refreshSession()});
function setFiles(files){selectedFiles=Array.from(files||[]);$("#fileList").innerHTML=selectedFiles.map(f=>`<li>${escapeHtml(f.name)} <span class="muted">(${(f.size/1024/1024).toFixed(2)} MB)</span></li>`).join("");$("#analyze").disabled=!selectedFiles.length}
$("#files").addEventListener("change",e=>setFiles(e.target.files));
const drop=$("#drop");drop.addEventListener("dragover",e=>{e.preventDefault();drop.style.background="#edf4fb"});drop.addEventListener("dragleave",()=>drop.style.background="");drop.addEventListener("drop",e=>{e.preventDefault();drop.style.background="";setFiles(e.dataTransfer.files)});
$("#analyze").addEventListener("click",async()=>{
  if(!selectedFiles.length)return;
  const fd=new FormData();selectedFiles.forEach(f=>fd.append("documents",f));
  $("#analyze").disabled=true;$("#status").textContent="Enviando e analisando os documentos. Cada arquivo será examinado individualmente e depois cruzado com os demais. Isso pode levar alguns minutos...";
  $("#results").classList.add("hidden");
  try{
    const r=await fetch("/api/analyze",{method:"POST",body:fd});const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Falha na análise.");
    report=d;renderReport(d);$("#results").classList.remove("hidden");$("#status").textContent="Análise concluída. Revise os originais e confira as referências antes de utilizar o relatório.";
  }catch(e){$("#status").textContent=e.message}
  finally{$("#analyze").disabled=false}
});
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function arr(v){return Array.isArray(v)?v:[]}
function list(v){return arr(v).length?`<ul>${arr(v).map(x=>`<li>${escapeHtml(typeof x==="string"?x:JSON.stringify(x))}</li>`).join("")}</ul>`:"<span class='muted'>Não identificado</span>"}
function field(label,value){return `<div class="item"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value||"Não identificado")}</p></div>`}
function table(rows,cols){if(!arr(rows).length)return "<p class='muted'>Nenhum item identificado.</p>";return `<div style="overflow-x:auto"><table class="data-table"><thead><tr>${cols.map(c=>`<th>${escapeHtml(c[1])}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${cols.map(c=>`<td>${escapeHtml(row[c[0]]??"—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`}
function renderReport(d){
 const s=d.synthesis||{};
 $("#summary").innerHTML=`<h2>Visão geral</h2><p>${escapeHtml(s.visao_geral||"")}</p><div class="grid"><div class="card"><strong>Arquivos analisados</strong><h2>${d.files.length}</h2></div><div class="card"><strong>Itens no quadro probatório</strong><h2>${arr(s.quadro_probatorio).length}</h2></div><div class="card"><strong>Divergências identificadas</strong><h2>${arr(s.divergencias_e_contradicoes).length}</h2></div></div><p class="muted">Modelo: ${escapeHtml(d.model)} · Arquivos: ${d.files.map(escapeHtml).join(", ")}</p>`;
 $("#tab-board").innerHTML=table(arr(s.quadro_probatorio).map(x=>({...x,origem:x.origem||"",diligencias:arr(x.diligencias).join("; ")})),[["documento","Documento"],["data","Data"],["origem","Origem"],["classificacao","Classificação"],["natureza_da_informacao","Natureza"],["conteudo_relevante","Conteúdo relevante"],["o_que_pode_demonstrar","O que pode demonstrar"],["o_que_nao_demonstra","O que não demonstra"],["favoravel_ou_desfavoravel","Avaliação"],["limites_e_riscos","Limites/riscos"],["localizacao","Localização"],["diligencias","Diligências"]]);
 $("#tab-timeline").innerHTML=table(arr(s.cronologia),[["data","Data"],["evento","Evento"],["documentos_relacionados","Documentos"],["observacao_sobre_a_fonte","Fonte/observação"]].map(c=>c[0]==="documentos_relacionados"?["documentos_relacionados","Documentos"]:c));
 $("#tab-cross").innerHTML=`<h2>Convergências</h2>${list(s.convergencias_entre_documentos)}<h2>Divergências e contradições</h2>${arr(s.divergencias_e_contradicoes).map(x=>`<div class="item"><h3>${escapeHtml(x.tema)}</h3>${field("Documentos",arr(x.documentos_em_conflito).join("; "))}${field("Descrição",x.descricao)}${field("Possíveis explicações a verificar",x.possivel_explicacao_sem_presuncao)}<strong>Como esclarecer</strong>${list(x.como_esclarecer)}</div>`).join("")}<h2>Lacunas</h2>${list(s.lacunas_do_conjunto)}`;
 $("#tab-strategy").innerHTML=`<h2>Pontos favoráveis</h2>${list(s.pontos_favoraveis_a_defesa)}<h2>Pontos de atenção e riscos</h2>${list(s.pontos_de_atencao_e_riscos)}<h2>Diligências prioritárias</h2>${list(s.diligencias_prioritarias)}<h2>Perguntas para o cliente</h2>${arr(s.perguntas_para_o_cliente).map(x=>`<div class="item"><h3>${escapeHtml(x.pergunta)}</h3><p>${escapeHtml(x.motivo)}</p><p class="muted">Corroboração: ${escapeHtml(x.documento_ou_testemunha_que_pode_confirmar)}</p></div>`).join("")}<h2>Linhas argumentativas a examinar</h2>${list(s.teses_ou_linhas_argumentativas_a_examinar)}<h2>Estrutura sugerida</h2>${list(s.estrutura_sugerida_da_defesa)}<h2>Ressalvas</h2><p>${escapeHtml(s.ressalvas||"")}</p>`;
 $("#tab-draft").innerHTML=`<p class="muted">Minuta preliminar gerada com base apenas nos documentos enviados. Revise fatos, nomes, datas, pedidos, legislação, competência, prazos e autos integrais antes de protocolar.</p><div class="draft">${escapeHtml(s.minuta_base||"Minuta não gerada.")}</div><button class="secondary" id="copyDraft">Copiar minuta</button>`;
 $("#copyDraft").addEventListener("click",()=>navigator.clipboard.writeText(s.minuta_base||""));
 $("#tab-individual").innerHTML=arr(d.individual).map(x=>`<div class="item"><h3>${escapeHtml(x.identificacao?.nome_arquivo||"Documento")}</h3><span class="tag">${escapeHtml(x.classificacao)}</span><p>${escapeHtml(x.resumo_objetivo)}</p><div class="grid">${field("Natureza da informação",x.natureza_informacao)}${field("Origem/autor",x.identificacao?.autor_ou_origem)}${field("Data",x.identificacao?.data_documento)}${field("Limites",x.confiabilidade_e_limites)}</div><strong>Fatos relevantes</strong>${list(x.fatos_relevantes)}<strong>O que pode demonstrar</strong>${list(x.o_que_pode_demonstrar)}<strong>O que não demonstra por si só</strong>${list(x.o_que_nao_demonstra_por_si_so)}<strong>Pontos favoráveis</strong>${list(x.pontos_favoraveis)}<strong>Pontos desfavoráveis/riscos</strong>${list(x.pontos_desfavoraveis_ou_riscos)}<strong>Contradições/lacunas</strong>${list(x.contradicoes_ou_lacunas)}<strong>Diligências</strong>${list(x.diligencias_recomendadas)}<strong>Alertas</strong>${list(x.alertas_de_conferencia_humana)}</div>`).join("");
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".tabcontent").forEach(x=>x.classList.add("hidden"));$("#tab-"+b.dataset.tab).classList.remove("hidden")}));
$("#export").addEventListener("click",()=>{if(!report)return;const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="relatorio-analise-juridica.json";a.click();URL.revokeObjectURL(a.href)});
$("#print").addEventListener("click",()=>window.print());
refreshSession();
