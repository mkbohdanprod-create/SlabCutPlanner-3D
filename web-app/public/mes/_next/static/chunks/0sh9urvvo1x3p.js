(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,52683,e=>{"use strict";let t,r;var i=e.i(43476),s=e.i(71645),n=e.i(9165),a=e.i(32549),l=e.i(22140),o=e.i(46513),d=e.i(56420);let c=(0,d.default)("settings-2",[["path",{d:"M14 17H5",key:"gfn3mx"}],["path",{d:"M19 7h-9",key:"6i9tg"}],["circle",{cx:"17",cy:"17",r:"3",key:"18b49y"}],["circle",{cx:"7",cy:"7",r:"3",key:"dfmy0x"}]]);function u({machines:e,onSelect:t,isLoading:r}){return r?(0,i.jsxs)("div",{className:"flex flex-col items-center justify-center p-12",children:[(0,i.jsx)("div",{className:"w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"}),(0,i.jsx)("p",{className:"text-zinc-400",children:"Завантаження списку верстатів..."})]}):0===e.length?(0,i.jsx)("div",{className:"text-center p-12 bg-zinc-900 rounded-3xl",children:(0,i.jsx)("p",{className:"text-zinc-400",children:"Не знайдено жодного верстата. Зверніться до адміністратора."})}):(0,i.jsxs)("div",{className:"w-full max-w-5xl mx-auto",children:[(0,i.jsxs)("div",{className:"text-center mb-12",children:[(0,i.jsx)("h2",{className:"text-3xl font-bold text-white mb-3",children:"Виберіть верстат"}),(0,i.jsx)("p",{className:"text-zinc-400 text-lg",children:"Вкажіть ваше поточне робоче місце"})]}),(0,i.jsx)("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",children:e.map(e=>(0,i.jsxs)("button",{onClick:()=>t(e),className:"group flex flex-col text-left p-6 rounded-3xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/50 transition-all shadow-lg hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]",children:[(0,i.jsxs)("div",{className:"flex items-start justify-between mb-6",children:[(0,i.jsx)("div",{className:"w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform",children:(0,i.jsx)(o.Monitor,{size:32,strokeWidth:1.5})}),(0,i.jsx)("div",{className:`px-3 py-1 rounded-full text-xs font-medium border ${"working"===e.status?"bg-emerald-500/10 text-emerald-400 border-emerald-500/20":"warning"===e.status?"bg-amber-500/10 text-amber-400 border-amber-500/20":"bg-red-500/10 text-red-400 border-red-500/20"}`,children:"working"===e.status?"В роботі":"warning"===e.status?"Увага":"Помилка"})]}),(0,i.jsx)("h3",{className:"text-xl font-bold text-white mb-2",children:e.name}),(0,i.jsxs)("div",{className:"flex items-center gap-2 text-zinc-400 text-sm mb-6",children:[(0,i.jsx)(c,{size:16}),(0,i.jsxs)("span",{children:["ID: ",e.id," • Зона: ",e.zone_id]})]}),(0,i.jsx)("div",{className:"mt-auto pt-6 border-t border-zinc-800/50",children:(0,i.jsxs)("div",{className:"flex justify-between text-sm",children:[(0,i.jsx)("span",{className:"text-zinc-500",children:"Завдань в черзі:"}),(0,i.jsx)("span",{className:"text-white font-medium",children:e.total_tasks||0})]})})]},e.id))})]})}let f=(0,d.default)("refresh-cw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);var x=e.i(62825);let m=(0,d.default)("scan-barcode",[["path",{d:"M3 7V5a2 2 0 0 1 2-2h2",key:"aa7l1z"}],["path",{d:"M17 3h2a2 2 0 0 1 2 2v2",key:"4qcy5o"}],["path",{d:"M21 17v2a2 2 0 0 1-2 2h-2",key:"6vwrx8"}],["path",{d:"M7 21H5a2 2 0 0 1-2-2v-2",key:"ioqczr"}],["path",{d:"M8 7v10",key:"23sfjj"}],["path",{d:"M12 7v10",key:"jspqdw"}],["path",{d:"M17 7v10",key:"578dap"}]]);function h({onScan:e}){let[t,r]=(0,s.useState)(""),[n,a]=(0,s.useState)(!1),l=async i=>{i.preventDefault(),!t||n||(a(!0),await e(t)?r(""):alert("Помилка сканування або деталь не знайдена."),a(!1))};return(0,i.jsxs)("div",{className:"bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl h-full flex flex-col justify-center",children:[(0,i.jsxs)("div",{className:"flex items-center gap-3 mb-6",children:[(0,i.jsx)("div",{className:"p-2 bg-blue-600/20 text-blue-400 rounded-lg",children:(0,i.jsx)(m,{size:24})}),(0,i.jsx)("h3",{className:"text-xl font-bold text-white",children:"Сканування деталі"})]}),(0,i.jsxs)("form",{onSubmit:l,className:"flex gap-4",children:[(0,i.jsx)("input",{type:"text",value:t,onChange:e=>r(e.target.value),placeholder:"Штрихкод (напр. BRC-12345)",className:"flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-6 py-4 text-xl text-white focus:outline-none focus:border-blue-500 transition-colors",autoFocus:!0}),(0,i.jsx)("button",{type:"submit",disabled:n||!t,className:"px-8 py-4 bg-blue-600 text-white rounded-xl text-lg font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:n?"...":"Знайти"})]})]})}let p=(0,d.default)("activity",[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]]),v=(0,d.default)("circle-check",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]),b=(0,d.default)("pause",[["rect",{x:"14",y:"3",width:"5",height:"18",rx:"1",key:"kaeet6"}],["rect",{x:"5",y:"3",width:"5",height:"18",rx:"1",key:"1wsw3u"}]]),g=(0,d.default)("circle-alert",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);function y({currentTask:e,onComplete:t,onOpenInstruction:r}){return(0,i.jsxs)("div",{className:"h-full w-full bg-zinc-900 rounded-3xl border border-zinc-800 p-8 shadow-2xl flex flex-col relative overflow-hidden",children:[(0,i.jsx)("div",{className:"absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"}),(0,i.jsxs)("div",{className:"flex items-center gap-3 mb-8",children:[(0,i.jsx)("div",{className:"p-2 bg-blue-500/10 text-blue-400 rounded-lg",children:(0,i.jsx)(p,{size:24})}),(0,i.jsx)("h2",{className:"text-2xl font-bold text-white",children:"В роботі"})]}),(0,i.jsx)("div",{className:"flex-1 flex flex-col justify-center",children:e?(0,i.jsxs)("div",{className:"flex flex-col h-full",children:[(0,i.jsxs)("div",{className:"mb-auto",children:[(0,i.jsx)("div",{className:"text-5xl font-black text-white tracking-tight mb-4",children:e.detail_name}),(0,i.jsxs)("div",{className:"text-2xl text-blue-400 font-medium mb-8",children:["Замовлення: ",e.order_number]}),(0,i.jsxs)("div",{className:"grid grid-cols-2 gap-6",children:[(0,i.jsxs)("div",{className:"bg-zinc-950/50 p-6 rounded-2xl border border-zinc-800/50",children:[(0,i.jsx)("div",{className:"text-sm text-zinc-500 mb-1",children:"Клієнт"}),(0,i.jsx)("div",{className:"text-xl text-zinc-200",children:e.client})]}),(0,i.jsxs)("div",{className:"bg-zinc-950/50 p-6 rounded-2xl border border-zinc-800/50",children:[(0,i.jsx)("div",{className:"text-sm text-zinc-500 mb-1",children:"Матеріал"}),(0,i.jsx)("div",{className:"text-xl text-zinc-200",children:e.material})]})]})]}),(0,i.jsxs)("div",{className:"flex gap-4 mt-8",children:[(0,i.jsxs)("button",{onClick:t,className:"flex-1 flex items-center justify-center gap-3 py-6 bg-emerald-600 rounded-2xl text-xl font-bold hover:bg-emerald-500 transition-colors shadow-[0_0_30px_rgba(16,185,129,0.3)]",children:[(0,i.jsx)(v,{size:28}),"Завершити"]}),(0,i.jsx)("button",{onClick:r,className:"px-6 py-6 bg-blue-600/20 text-blue-400 rounded-2xl text-lg font-bold hover:bg-blue-600 hover:text-white transition-colors border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)] whitespace-nowrap",children:"Cube 3D Інструкція"}),(0,i.jsx)("button",{className:"px-6 py-6 bg-amber-600/20 text-amber-500 rounded-2xl text-xl font-bold hover:bg-amber-600 hover:text-white transition-colors border border-amber-600/30",children:(0,i.jsx)(b,{size:28})}),(0,i.jsx)("button",{className:"px-6 py-6 bg-red-600/20 text-red-500 rounded-2xl text-xl font-bold hover:bg-red-600 hover:text-white transition-colors border border-red-600/30",children:(0,i.jsx)(g,{size:28})})]})]}):(0,i.jsxs)("div",{className:"flex flex-col items-center justify-center h-full text-zinc-500",children:[(0,i.jsx)(v,{size:64,className:"mb-6 text-zinc-700",strokeWidth:1}),(0,i.jsx)("p",{className:"text-2xl font-medium",children:"Немає активних завдань"}),(0,i.jsx)("p",{className:"mt-2 text-zinc-600",children:"Відскануйте деталь або оберіть з черги"})]})})]})}var w=e.i(21357);function j({queue:e,isLoading:t,onTakeTask:r}){return(0,i.jsxs)("div",{className:"h-full w-full bg-zinc-900 rounded-3xl border border-zinc-800 p-6 flex flex-col",children:[(0,i.jsx)("div",{className:"flex items-center justify-between mb-6",children:(0,i.jsxs)("h3",{className:"text-xl font-bold text-white",children:["Черга (",e.length,")"]})}),(0,i.jsx)("div",{className:"flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar",children:t&&0===e.length?(0,i.jsx)("div",{className:"text-center py-10 text-zinc-500 animate-pulse",children:"Завантаження..."}):0===e.length?(0,i.jsx)("div",{className:"text-center py-10 text-zinc-500",children:"Черга порожня"}):e.map((e,t)=>(0,i.jsxs)("div",{onClick:()=>r(e.barcode),className:"bg-zinc-950 p-5 rounded-2xl border border-zinc-800 hover:border-zinc-700 transition-colors group cursor-pointer",children:[(0,i.jsxs)("div",{className:"flex justify-between items-start mb-2",children:[(0,i.jsx)("div",{className:"font-bold text-lg text-white",children:e.detail_name}),(0,i.jsx)("div",{className:"px-2 py-1 bg-zinc-800 text-zinc-400 text-xs font-bold rounded",children:e.op_name})]}),(0,i.jsxs)("div",{className:"text-sm text-zinc-500 mb-4",children:["Зам: ",e.order_number," • ",e.material]}),(0,i.jsx)("div",{className:"opacity-0 group-hover:opacity-100 transition-opacity",children:(0,i.jsxs)("button",{className:"w-full py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-bold hover:bg-blue-600 hover:text-white transition-colors flex items-center justify-center gap-2",children:[(0,i.jsx)(w.Play,{size:16}),"Взяти в роботу"]})})]},t))})]})}let S=(0,d.default)("file-image",[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["circle",{cx:"10",cy:"12",r:"2",key:"737tya"}],["path",{d:"m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22",key:"wt3hpn"}]]);function N({currentTask:e}){return e?(0,i.jsxs)("div",{className:"h-full w-full bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl flex flex-col",children:[(0,i.jsxs)("div",{className:"flex items-center gap-3 mb-6",children:[(0,i.jsx)("div",{className:"p-2 bg-indigo-600/20 text-indigo-400 rounded-lg",children:(0,i.jsx)(S,{size:24})}),(0,i.jsx)("h3",{className:"text-xl font-bold text-white",children:"Креслення"})]}),(0,i.jsxs)("div",{className:"flex-1 bg-zinc-950 rounded-2xl border border-zinc-800 p-4 flex flex-col items-center justify-center overflow-hidden relative group cursor-pointer hover:border-indigo-500/50 transition-colors",children:[(0,i.jsx)("div",{className:"absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent"}),(0,i.jsxs)("div",{className:"text-zinc-600 mb-2 border-2 border-dashed border-zinc-800 w-full h-full flex flex-col items-center justify-center rounded-xl",children:[(0,i.jsx)(S,{size:64,className:"mb-4 text-zinc-700 group-hover:text-indigo-400 transition-colors"}),(0,i.jsx)("p",{className:"text-sm font-medium text-zinc-500 group-hover:text-indigo-300",children:"Натисніть щоб збільшити креслення"}),(0,i.jsxs)("p",{className:"text-xs text-zinc-600 mt-1",children:[e.detail_name,".pdf"]})]})]})]}):(0,i.jsxs)("div",{className:"bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-xl flex flex-col items-center justify-center text-zinc-500 h-64",children:[(0,i.jsx)(S,{size:48,className:"mb-4 text-zinc-700"}),(0,i.jsx)("p",{children:"Немає креслення"})]})}var z=e.i(73474);let _=(0,d.default)("triangle-alert",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]),U=["Зламався інструмент","Помилка позиціонування","Людський фактор","Збій програми (ЧПК)"];function M({currentTask:e,machine:t,user:r,onDefectReported:a}){let[l,o]=(0,s.useState)(U[0]),[d,c]=(0,s.useState)(""),[u,f]=(0,s.useState)(!1),x=async i=>{i.preventDefault(),e&&(f(!0),await n.api.reportDefect(e.barcode,t.id,r.name,l,d)?(alert("Брак успішно зафіксовано. З зчитувача буде списано заготовку."),c(""),a()):alert("Помилка фіксації браку."),f(!1))};return e?(0,i.jsxs)("div",{className:"h-full w-full bg-red-950/20 rounded-3xl border border-red-900/50 p-6 shadow-xl flex flex-col",children:[(0,i.jsxs)("div",{className:"flex items-center gap-3 mb-6",children:[(0,i.jsx)("div",{className:"p-2 bg-red-600/20 text-red-400 rounded-lg",children:(0,i.jsx)(z.Trash2,{size:24})}),(0,i.jsx)("h3",{className:"text-xl font-bold text-red-200",children:"Фіксація браку"})]}),(0,i.jsxs)("form",{onSubmit:x,className:"flex flex-col gap-4 flex-1",children:[(0,i.jsxs)("div",{children:[(0,i.jsx)("label",{className:"block text-sm text-red-300 mb-2",children:"Причина браку"}),(0,i.jsx)("select",{value:l,onChange:e=>o(e.target.value),className:"w-full bg-zinc-950 border border-red-900/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500",children:U.map(e=>(0,i.jsx)("option",{value:e,children:e},e))})]}),(0,i.jsxs)("div",{className:"flex-1 flex flex-col",children:[(0,i.jsx)("label",{className:"block text-sm text-red-300 mb-2",children:"Коментар (обов'язково)"}),(0,i.jsx)("textarea",{value:d,onChange:e=>c(e.target.value),placeholder:"Опишіть що саме пішло не так...",required:!0,className:"w-full flex-1 bg-zinc-950 border border-red-900/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 resize-none"})]}),(0,i.jsx)("button",{type:"submit",disabled:u||!d,className:"w-full py-4 bg-red-600/20 text-red-500 border border-red-600/30 rounded-xl text-lg font-bold hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",children:u?"Фіксація...":(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(_,{size:20})," Зафіксувати брак"]})})]})]}):null}let E=(0,d.default)("message-square-warning",[["path",{d:"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",key:"18887p"}],["path",{d:"M12 15h.01",key:"q59x07"}],["path",{d:"M12 7v4",key:"xawao1"}]]),A=["Попередня ділянка (Оператор)","Склад матеріалів (ВТК)","Конструкторське Бюро (КБ)"];function D({currentTask:e,machine:t,user:r,onReclamationReported:a}){let[l,o]=(0,s.useState)(A[0]),[d,c]=(0,s.useState)(""),[u,f]=(0,s.useState)(!1),x=async i=>{i.preventDefault(),e&&(f(!0),await n.api.reportReclamation(e.barcode,t.id,r.name,l,d)?(alert(`Рекламація успішно відправлена на: ${l}.`),c(""),a()):alert("Помилка відправки рекламації."),f(!1))};return e?(0,i.jsxs)("div",{className:"h-full w-full bg-amber-950/20 rounded-3xl border border-amber-900/50 p-6 shadow-xl flex flex-col",children:[(0,i.jsxs)("div",{className:"flex items-center gap-3 mb-6",children:[(0,i.jsx)("div",{className:"p-2 bg-amber-600/20 text-amber-500 rounded-lg",children:(0,i.jsx)(E,{size:24})}),(0,i.jsx)("h3",{className:"text-xl font-bold text-amber-200",children:"Рекламація"})]}),(0,i.jsxs)("form",{onSubmit:x,className:"flex flex-col gap-4 flex-1",children:[(0,i.jsxs)("div",{children:[(0,i.jsx)("label",{className:"block text-sm text-amber-300 mb-2",children:"Одержувач претензії"}),(0,i.jsx)("select",{value:l,onChange:e=>o(e.target.value),className:"w-full bg-zinc-950 border border-amber-900/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500",children:A.map(e=>(0,i.jsx)("option",{value:e,children:e},e))})]}),(0,i.jsxs)("div",{className:"flex-1 flex flex-col",children:[(0,i.jsx)("label",{className:"block text-sm text-amber-300 mb-2",children:"Опис проблеми"}),(0,i.jsx)("textarea",{value:d,onChange:e=>c(e.target.value),placeholder:"Напр. скол на куті, не відповідає розмірам...",required:!0,className:"w-full flex-1 bg-zinc-950 border border-amber-900/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 resize-none"})]}),(0,i.jsx)("button",{type:"submit",disabled:u||!d,className:"w-full py-4 bg-amber-600/20 text-amber-500 border border-amber-600/30 rounded-xl text-lg font-bold hover:bg-amber-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",children:u?"Відправка...":(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(_,{size:20})," Відправити рекламацію"]})})]})]}):null}var L=e.i(75056),k=e.i(30297),C=e.i(31067),B=e.i(90072),O=e.i(28600),T=B,R=B;let I=new R.Box3,P=new R.Vector3;class H extends R.InstancedBufferGeometry{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type="LineSegmentsGeometry",this.setIndex([0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5]),this.setAttribute("position",new R.Float32BufferAttribute([-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],3)),this.setAttribute("uv",new R.Float32BufferAttribute([-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],2))}applyMatrix4(e){let t=this.attributes.instanceStart,r=this.attributes.instanceEnd;return void 0!==t&&(t.applyMatrix4(e),r.applyMatrix4(e),t.needsUpdate=!0),null!==this.boundingBox&&this.computeBoundingBox(),null!==this.boundingSphere&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let r=new R.InstancedInterleavedBuffer(t,6,1);return this.setAttribute("instanceStart",new R.InterleavedBufferAttribute(r,3,0)),this.setAttribute("instanceEnd",new R.InterleavedBufferAttribute(r,3,3)),this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e,t=3){let r;e instanceof Float32Array?r=e:Array.isArray(e)&&(r=new Float32Array(e));let i=new R.InstancedInterleavedBuffer(r,2*t,1);return this.setAttribute("instanceColorStart",new R.InterleavedBufferAttribute(i,t,0)),this.setAttribute("instanceColorEnd",new R.InterleavedBufferAttribute(i,t,t)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new R.WireframeGeometry(e.geometry)),this}fromLineSegments(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){null===this.boundingBox&&(this.boundingBox=new R.Box3);let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;void 0!==e&&void 0!==t&&(this.boundingBox.setFromBufferAttribute(e),I.setFromBufferAttribute(t),this.boundingBox.union(I))}computeBoundingSphere(){null===this.boundingSphere&&(this.boundingSphere=new R.Sphere),null===this.boundingBox&&this.computeBoundingBox();let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(void 0!==e&&void 0!==t){let r=this.boundingSphere.center;this.boundingBox.getCenter(r);let i=0;for(let s=0,n=e.count;s<n;s++)P.fromBufferAttribute(e,s),i=Math.max(i,r.distanceToSquared(P)),P.fromBufferAttribute(t,s),i=Math.max(i,r.distanceToSquared(P));this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error("THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.",this)}}toJSON(){}applyMatrix(e){return console.warn("THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4()."),this.applyMatrix4(e)}}var V=B,G=e.i(8560);let W=parseInt(B.REVISION.replace(/\D+/g,""));class F extends V.ShaderMaterial{constructor(e){super({type:"LineMaterial",uniforms:V.UniformsUtils.clone(V.UniformsUtils.merge([G.UniformsLib.common,G.UniformsLib.fog,{worldUnits:{value:1},linewidth:{value:1},resolution:{value:new V.Vector2(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}}])),vertexShader:`
				#include <common>
				#include <fog_pars_vertex>
				#include <logdepthbuf_pars_vertex>
				#include <clipping_planes_pars_vertex>

				uniform float linewidth;
				uniform vec2 resolution;

				attribute vec3 instanceStart;
				attribute vec3 instanceEnd;

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
						attribute vec4 instanceColorStart;
						attribute vec4 instanceColorEnd;
					#else
						varying vec3 vLineColor;
						attribute vec3 instanceColorStart;
						attribute vec3 instanceColorEnd;
					#endif
				#endif

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#ifdef USE_DASH

					uniform float dashScale;
					attribute float instanceDistanceStart;
					attribute float instanceDistanceEnd;
					varying float vLineDistance;

				#endif

				void trimSegment( const in vec4 start, inout vec4 end ) {

					// trim end segment so it terminates between the camera plane and the near plane

					// conservative estimate of the near plane
					float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
					float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
					float nearEstimate = - 0.5 * b / a;

					float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

					end.xyz = mix( start.xyz, end.xyz, alpha );

				}

				void main() {

					#ifdef USE_COLOR

						vLineColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

					#endif

					#ifdef USE_DASH

						vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
						vUv = uv;

					#endif

					float aspect = resolution.x / resolution.y;

					// camera space
					vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
					vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

					#ifdef WORLD_UNITS

						worldStart = start.xyz;
						worldEnd = end.xyz;

					#else

						vUv = uv;

					#endif

					// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
					// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
					// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
					// perhaps there is a more elegant solution -- WestLangley

					bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

					if ( perspective ) {

						if ( start.z < 0.0 && end.z >= 0.0 ) {

							trimSegment( start, end );

						} else if ( end.z < 0.0 && start.z >= 0.0 ) {

							trimSegment( end, start );

						}

					}

					// clip space
					vec4 clipStart = projectionMatrix * start;
					vec4 clipEnd = projectionMatrix * end;

					// ndc space
					vec3 ndcStart = clipStart.xyz / clipStart.w;
					vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

					// direction
					vec2 dir = ndcEnd.xy - ndcStart.xy;

					// account for clip-space aspect ratio
					dir.x *= aspect;
					dir = normalize( dir );

					#ifdef WORLD_UNITS

						// get the offset direction as perpendicular to the view vector
						vec3 worldDir = normalize( end.xyz - start.xyz );
						vec3 offset;
						if ( position.y < 0.5 ) {

							offset = normalize( cross( start.xyz, worldDir ) );

						} else {

							offset = normalize( cross( end.xyz, worldDir ) );

						}

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );

						// don't extend the line if we're rendering dashes because we
						// won't be rendering the endcaps
						#ifndef USE_DASH

							// extend the line bounds to encompass  endcaps
							start.xyz += - worldDir * linewidth * 0.5;
							end.xyz += worldDir * linewidth * 0.5;

							// shift the position of the quad so it hugs the forward edge of the line
							offset.xy -= dir * forwardOffset;
							offset.z += 0.5;

						#endif

						// endcaps
						if ( position.y > 1.0 || position.y < 0.0 ) {

							offset.xy += dir * 2.0 * forwardOffset;

						}

						// adjust for linewidth
						offset *= linewidth * 0.5;

						// set the world position
						worldPos = ( position.y < 0.5 ) ? start : end;
						worldPos.xyz += offset;

						// project the worldpos
						vec4 clip = projectionMatrix * worldPos;

						// shift the depth of the projected points so the line
						// segments overlap neatly
						vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
						clip.z = clipPose.z * clip.w;

					#else

						vec2 offset = vec2( dir.y, - dir.x );
						// undo aspect ratio adjustment
						dir.x /= aspect;
						offset.x /= aspect;

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						// endcaps
						if ( position.y < 0.0 ) {

							offset += - dir;

						} else if ( position.y > 1.0 ) {

							offset += dir;

						}

						// adjust for linewidth
						offset *= linewidth;

						// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
						offset /= resolution.y;

						// select end
						vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

						// back to clip space
						offset *= clip.w;

						clip.xy += offset;

					#endif

					gl_Position = clip;

					vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

					#include <logdepthbuf_vertex>
					#include <clipping_planes_vertex>
					#include <fog_vertex>

				}
			`,fragmentShader:`
				uniform vec3 diffuse;
				uniform float opacity;
				uniform float linewidth;

				#ifdef USE_DASH

					uniform float dashOffset;
					uniform float dashSize;
					uniform float gapSize;

				#endif

				varying float vLineDistance;

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#include <common>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <clipping_planes_pars_fragment>

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
					#else
						varying vec3 vLineColor;
					#endif
				#endif

				vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

					float mua;
					float mub;

					vec3 p13 = p1 - p3;
					vec3 p43 = p4 - p3;

					vec3 p21 = p2 - p1;

					float d1343 = dot( p13, p43 );
					float d4321 = dot( p43, p21 );
					float d1321 = dot( p13, p21 );
					float d4343 = dot( p43, p43 );
					float d2121 = dot( p21, p21 );

					float denom = d2121 * d4343 - d4321 * d4321;

					float numer = d1343 * d4321 - d1321 * d4343;

					mua = numer / denom;
					mua = clamp( mua, 0.0, 1.0 );
					mub = ( d1343 + d4321 * ( mua ) ) / d4343;
					mub = clamp( mub, 0.0, 1.0 );

					return vec2( mua, mub );

				}

				void main() {

					#include <clipping_planes_fragment>

					#ifdef USE_DASH

						if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

						if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

					#endif

					float alpha = opacity;

					#ifdef WORLD_UNITS

						// Find the closest points on the view ray and the line segment
						vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
						vec3 lineDir = worldEnd - worldStart;
						vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

						vec3 p1 = worldStart + lineDir * params.x;
						vec3 p2 = rayEnd * params.y;
						vec3 delta = p1 - p2;
						float len = length( delta );
						float norm = len / linewidth;

						#ifndef USE_DASH

							#ifdef USE_ALPHA_TO_COVERAGE

								float dnorm = fwidth( norm );
								alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

							#else

								if ( norm > 0.5 ) {

									discard;

								}

							#endif

						#endif

					#else

						#ifdef USE_ALPHA_TO_COVERAGE

							// artifacts appear on some hardware if a derivative is taken within a conditional
							float a = vUv.x;
							float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
							float len2 = a * a + b * b;
							float dlen = fwidth( len2 );

							if ( abs( vUv.y ) > 1.0 ) {

								alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

							}

						#else

							if ( abs( vUv.y ) > 1.0 ) {

								float a = vUv.x;
								float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
								float len2 = a * a + b * b;

								if ( len2 > 1.0 ) discard;

							}

						#endif

					#endif

					vec4 diffuseColor = vec4( diffuse, alpha );
					#ifdef USE_COLOR
						#ifdef USE_LINE_COLOR_ALPHA
							diffuseColor *= vLineColor;
						#else
							diffuseColor.rgb *= vLineColor;
						#endif
					#endif

					#include <logdepthbuf_fragment>

					gl_FragColor = diffuseColor;

					#include <tonemapping_fragment>
					#include <${W>=154?"colorspace_fragment":"encodings_fragment"}>
					#include <fog_fragment>
					#include <premultiplied_alpha_fragment>

				}
			`,clipping:!0}),this.isLineMaterial=!0,this.onBeforeCompile=function(){this.transparent?this.defines.USE_LINE_COLOR_ALPHA="1":delete this.defines.USE_LINE_COLOR_ALPHA},Object.defineProperties(this,{color:{enumerable:!0,get:function(){return this.uniforms.diffuse.value},set:function(e){this.uniforms.diffuse.value=e}},worldUnits:{enumerable:!0,get:function(){return"WORLD_UNITS"in this.defines},set:function(e){!0===e?this.defines.WORLD_UNITS="":delete this.defines.WORLD_UNITS}},linewidth:{enumerable:!0,get:function(){return this.uniforms.linewidth.value},set:function(e){this.uniforms.linewidth.value=e}},dashed:{enumerable:!0,get:function(){return"USE_DASH"in this.defines},set(e){!!e!="USE_DASH"in this.defines&&(this.needsUpdate=!0),!0===e?this.defines.USE_DASH="":delete this.defines.USE_DASH}},dashScale:{enumerable:!0,get:function(){return this.uniforms.dashScale.value},set:function(e){this.uniforms.dashScale.value=e}},dashSize:{enumerable:!0,get:function(){return this.uniforms.dashSize.value},set:function(e){this.uniforms.dashSize.value=e}},dashOffset:{enumerable:!0,get:function(){return this.uniforms.dashOffset.value},set:function(e){this.uniforms.dashOffset.value=e}},gapSize:{enumerable:!0,get:function(){return this.uniforms.gapSize.value},set:function(e){this.uniforms.gapSize.value=e}},opacity:{enumerable:!0,get:function(){return this.uniforms.opacity.value},set:function(e){this.uniforms.opacity.value=e}},resolution:{enumerable:!0,get:function(){return this.uniforms.resolution.value},set:function(e){this.uniforms.resolution.value.copy(e)}},alphaToCoverage:{enumerable:!0,get:function(){return"USE_ALPHA_TO_COVERAGE"in this.defines},set:function(e){!!e!="USE_ALPHA_TO_COVERAGE"in this.defines&&(this.needsUpdate=!0),!0===e?(this.defines.USE_ALPHA_TO_COVERAGE="",this.extensions.derivatives=!0):(delete this.defines.USE_ALPHA_TO_COVERAGE,this.extensions.derivatives=!1)}}}),this.setValues(e)}}let q=W>=125?"uv1":"uv2",J=new T.Vector4,Z=new T.Vector3,$=new T.Vector3,K=new T.Vector4,X=new T.Vector4,Q=new T.Vector4,Y=new T.Vector3,ee=new T.Matrix4,et=new T.Line3,er=new T.Vector3,ei=new T.Box3,es=new T.Sphere,en=new T.Vector4;function ea(e,t,i){return en.set(0,0,-t,1).applyMatrix4(e.projectionMatrix),en.multiplyScalar(1/en.w),en.x=r/i.width,en.y=r/i.height,en.applyMatrix4(e.projectionMatrixInverse),en.multiplyScalar(1/en.w),Math.abs(Math.max(en.x,en.y))}class el extends T.Mesh{constructor(e=new H,t=new F({color:0xffffff*Math.random()})){super(e,t),this.isLineSegments2=!0,this.type="LineSegments2"}computeLineDistances(){let e=this.geometry,t=e.attributes.instanceStart,r=e.attributes.instanceEnd,i=new Float32Array(2*t.count);for(let e=0,s=0,n=t.count;e<n;e++,s+=2)Z.fromBufferAttribute(t,e),$.fromBufferAttribute(r,e),i[s]=0===s?0:i[s-1],i[s+1]=i[s]+Z.distanceTo($);let s=new T.InstancedInterleavedBuffer(i,2,1);return e.setAttribute("instanceDistanceStart",new T.InterleavedBufferAttribute(s,1,0)),e.setAttribute("instanceDistanceEnd",new T.InterleavedBufferAttribute(s,1,1)),this}raycast(e,i){let s,n,a=this.material.worldUnits,l=e.camera;null!==l||a||console.error('LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.');let o=void 0!==e.params.Line2&&e.params.Line2.threshold||0;t=e.ray;let d=this.matrixWorld,c=this.geometry,u=this.material;if(r=u.linewidth+o,null===c.boundingSphere&&c.computeBoundingSphere(),es.copy(c.boundingSphere).applyMatrix4(d),a)s=.5*r;else{let e=Math.max(l.near,es.distanceToPoint(t.origin));s=ea(l,e,u.resolution)}if(es.radius+=s,!1!==t.intersectsSphere(es)){if(null===c.boundingBox&&c.computeBoundingBox(),ei.copy(c.boundingBox).applyMatrix4(d),a)n=.5*r;else{let e=Math.max(l.near,ei.distanceToPoint(t.origin));n=ea(l,e,u.resolution)}ei.expandByScalar(n),!1!==t.intersectsBox(ei)&&(a?function(e,i){let s=e.matrixWorld,n=e.geometry,a=n.attributes.instanceStart,l=n.attributes.instanceEnd,o=Math.min(n.instanceCount,a.count);for(let n=0;n<o;n++){et.start.fromBufferAttribute(a,n),et.end.fromBufferAttribute(l,n),et.applyMatrix4(s);let o=new T.Vector3,d=new T.Vector3;t.distanceSqToSegment(et.start,et.end,d,o),d.distanceTo(o)<.5*r&&i.push({point:d,pointOnLine:o,distance:t.origin.distanceTo(d),object:e,face:null,faceIndex:n,uv:null,[q]:null})}}(this,i):function(e,i,s){let n=i.projectionMatrix,a=e.material.resolution,l=e.matrixWorld,o=e.geometry,d=o.attributes.instanceStart,c=o.attributes.instanceEnd,u=Math.min(o.instanceCount,d.count),f=-i.near;t.at(1,Q),Q.w=1,Q.applyMatrix4(i.matrixWorldInverse),Q.applyMatrix4(n),Q.multiplyScalar(1/Q.w),Q.x*=a.x/2,Q.y*=a.y/2,Q.z=0,Y.copy(Q),ee.multiplyMatrices(i.matrixWorldInverse,l);for(let i=0;i<u;i++){if(K.fromBufferAttribute(d,i),X.fromBufferAttribute(c,i),K.w=1,X.w=1,K.applyMatrix4(ee),X.applyMatrix4(ee),K.z>f&&X.z>f)continue;if(K.z>f){let e=K.z-X.z,t=(K.z-f)/e;K.lerp(X,t)}else if(X.z>f){let e=X.z-K.z,t=(X.z-f)/e;X.lerp(K,t)}K.applyMatrix4(n),X.applyMatrix4(n),K.multiplyScalar(1/K.w),X.multiplyScalar(1/X.w),K.x*=a.x/2,K.y*=a.y/2,X.x*=a.x/2,X.y*=a.y/2,et.start.copy(K),et.start.z=0,et.end.copy(X),et.end.z=0;let o=et.closestPointToPointParameter(Y,!0);et.at(o,er);let u=T.MathUtils.lerp(K.z,X.z,o),x=u>=-1&&u<=1,m=Y.distanceTo(er)<.5*r;if(x&&m){et.start.fromBufferAttribute(d,i),et.end.fromBufferAttribute(c,i),et.start.applyMatrix4(l),et.end.applyMatrix4(l);let r=new T.Vector3,n=new T.Vector3;t.distanceSqToSegment(et.start,et.end,n,r),s.push({point:n,pointOnLine:r,distance:t.origin.distanceTo(n),object:e,face:null,faceIndex:i,uv:null,[q]:null})}}}(this,l,i))}}onBeforeRender(e){let t=this.material.uniforms;t&&t.resolution&&(e.getViewport(J),this.material.uniforms.resolution.value.set(J.z,J.w))}}class eo extends H{constructor(){super(),this.isLineGeometry=!0,this.type="LineGeometry"}setPositions(e){let t=e.length-3,r=new Float32Array(2*t);for(let i=0;i<t;i+=3)r[2*i]=e[i],r[2*i+1]=e[i+1],r[2*i+2]=e[i+2],r[2*i+3]=e[i+3],r[2*i+4]=e[i+4],r[2*i+5]=e[i+5];return super.setPositions(r),this}setColors(e,t=3){let r=e.length-t,i=new Float32Array(2*r);if(3===t)for(let s=0;s<r;s+=t)i[2*s]=e[s],i[2*s+1]=e[s+1],i[2*s+2]=e[s+2],i[2*s+3]=e[s+3],i[2*s+4]=e[s+4],i[2*s+5]=e[s+5];else for(let s=0;s<r;s+=t)i[2*s]=e[s],i[2*s+1]=e[s+1],i[2*s+2]=e[s+2],i[2*s+3]=e[s+3],i[2*s+4]=e[s+4],i[2*s+5]=e[s+5],i[2*s+6]=e[s+6],i[2*s+7]=e[s+7];return super.setColors(i,t),this}fromLine(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}}class ed extends el{constructor(e=new eo,t=new F({color:0xffffff*Math.random()})){super(e,t),this.isLine2=!0,this.type="Line2"}}let ec=s.forwardRef(function({points:e,color:t=0xffffff,vertexColors:r,linewidth:i,lineWidth:n,segments:a,dashed:l,...o},d){var c,u;let f=(0,O.useThree)(e=>e.size),x=s.useMemo(()=>a?new el:new ed,[a]),[m]=s.useState(()=>new F),h=(null==r||null==(c=r[0])?void 0:c.length)===4?4:3,p=s.useMemo(()=>{let i=a?new H:new eo,s=e.map(e=>{let t=Array.isArray(e);return e instanceof B.Vector3||e instanceof B.Vector4?[e.x,e.y,e.z]:e instanceof B.Vector2?[e.x,e.y,0]:t&&3===e.length?[e[0],e[1],e[2]]:t&&2===e.length?[e[0],e[1],0]:e});if(i.setPositions(s.flat()),r){t=0xffffff;let e=r.map(e=>e instanceof B.Color?e.toArray():e);i.setColors(e.flat(),h)}return i},[e,a,r,h]);return s.useLayoutEffect(()=>{x.computeLineDistances()},[e,x]),s.useLayoutEffect(()=>{l?m.defines.USE_DASH="":delete m.defines.USE_DASH,m.needsUpdate=!0},[l,m]),s.useEffect(()=>()=>{p.dispose(),m.dispose()},[p]),s.createElement("primitive",(0,C.default)({object:x,ref:d},o),s.createElement("primitive",{object:p,attach:"geometry"}),s.createElement("primitive",(0,C.default)({object:m,attach:"material",color:t,vertexColors:!!r,resolution:[f.width,f.height],linewidth:null!=(u=null!=i?i:n)?u:1,dashed:l,transparent:4===h},o)))}),eu=s.forwardRef(({threshold:e=15,geometry:t,...r},i)=>{let n=s.useRef(null);s.useImperativeHandle(i,()=>n.current,[]);let a=s.useMemo(()=>[0,0,0,1,0,0],[]),l=s.useRef(null),o=s.useRef(null);return s.useLayoutEffect(()=>{let r=n.current.parent,i=null!=t?t:null==r?void 0:r.geometry;if(!i||l.current===i&&o.current===e)return;l.current=i,o.current=e;let s=new B.EdgesGeometry(i,e).attributes.position.array;n.current.geometry.setPositions(s),n.current.geometry.attributes.instanceStart.needsUpdate=!0,n.current.geometry.attributes.instanceEnd.needsUpdate=!0,n.current.computeLineDistances()}),s.createElement(ec,(0,C.default)({segments:!0,points:a,ref:n,raycast:()=>null},r))});var ef=e.i(60099),ex=e.i(25234);let em={uniforms:{tDiffuse:{value:null},h:{value:1/512}},vertexShader:`
      varying vec2 vUv;

      void main() {

        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

      }
  `,fragmentShader:`
    uniform sampler2D tDiffuse;
    uniform float h;

    varying vec2 vUv;

    void main() {

    	vec4 sum = vec4( 0.0 );

    	sum += texture2D( tDiffuse, vec2( vUv.x - 4.0 * h, vUv.y ) ) * 0.051;
    	sum += texture2D( tDiffuse, vec2( vUv.x - 3.0 * h, vUv.y ) ) * 0.0918;
    	sum += texture2D( tDiffuse, vec2( vUv.x - 2.0 * h, vUv.y ) ) * 0.12245;
    	sum += texture2D( tDiffuse, vec2( vUv.x - 1.0 * h, vUv.y ) ) * 0.1531;
    	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
    	sum += texture2D( tDiffuse, vec2( vUv.x + 1.0 * h, vUv.y ) ) * 0.1531;
    	sum += texture2D( tDiffuse, vec2( vUv.x + 2.0 * h, vUv.y ) ) * 0.12245;
    	sum += texture2D( tDiffuse, vec2( vUv.x + 3.0 * h, vUv.y ) ) * 0.0918;
    	sum += texture2D( tDiffuse, vec2( vUv.x + 4.0 * h, vUv.y ) ) * 0.051;

    	gl_FragColor = sum;

    }
  `},eh={uniforms:{tDiffuse:{value:null},v:{value:1/512}},vertexShader:`
    varying vec2 vUv;

    void main() {

      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

    }
  `,fragmentShader:`

  uniform sampler2D tDiffuse;
  uniform float v;

  varying vec2 vUv;

  void main() {

    vec4 sum = vec4( 0.0 );

    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 4.0 * v ) ) * 0.051;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 3.0 * v ) ) * 0.0918;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 2.0 * v ) ) * 0.12245;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 1.0 * v ) ) * 0.1531;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 1.0 * v ) ) * 0.1531;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 2.0 * v ) ) * 0.12245;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 3.0 * v ) ) * 0.0918;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 4.0 * v ) ) * 0.051;

    gl_FragColor = sum;

  }
  `},ep=s.forwardRef(({scale:e=10,frames:t=1/0,opacity:r=1,width:i=1,height:n=1,blur:a=1,near:l=0,far:o=10,resolution:d=512,smooth:c=!0,color:u="#000000",depthWrite:f=!1,renderOrder:x,...m},h)=>{let p,v,b=s.useRef(null),g=(0,O.useThree)(e=>e.scene),y=(0,O.useThree)(e=>e.gl),w=s.useRef(null);i*=Array.isArray(e)?e[0]:e||1,n*=Array.isArray(e)?e[1]:e||1;let[j,S,N,z,_,U,M]=s.useMemo(()=>{let e=new B.WebGLRenderTarget(d,d),t=new B.WebGLRenderTarget(d,d);t.texture.generateMipmaps=e.texture.generateMipmaps=!1;let r=new B.PlaneGeometry(i,n).rotateX(Math.PI/2),s=new B.Mesh(r),a=new B.MeshDepthMaterial;a.depthTest=a.depthWrite=!1,a.onBeforeCompile=e=>{e.uniforms={...e.uniforms,ucolor:{value:new B.Color(u)}},e.fragmentShader=e.fragmentShader.replace("void main() {",`uniform vec3 ucolor;
           void main() {
          `),e.fragmentShader=e.fragmentShader.replace("vec4( vec3( 1.0 - fragCoordZ ), opacity );","vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );")};let l=new B.ShaderMaterial(em),o=new B.ShaderMaterial(eh);return o.depthTest=l.depthTest=!1,[e,r,a,s,l,o,t]},[d,i,n,e,u]),E=e=>{z.visible=!0,z.material=_,_.uniforms.tDiffuse.value=j.texture,_.uniforms.h.value=e/256,y.setRenderTarget(M),y.render(z,w.current),z.material=U,U.uniforms.tDiffuse.value=M.texture,U.uniforms.v.value=e/256,y.setRenderTarget(j),y.render(z,w.current),z.visible=!1},A=0;return(0,ex.useFrame)(()=>{w.current&&(t===1/0||A<t)&&(A++,p=g.background,v=g.overrideMaterial,b.current.visible=!1,g.background=null,g.overrideMaterial=N,y.setRenderTarget(j),y.render(g,w.current),E(a),c&&E(.4*a),y.setRenderTarget(null),b.current.visible=!0,g.overrideMaterial=v,g.background=p)}),s.useImperativeHandle(h,()=>b.current,[]),s.createElement("group",(0,C.default)({"rotation-x":Math.PI/2},m,{ref:b}),s.createElement("mesh",{renderOrder:x,geometry:S,scale:[1,-1,1],rotation:[-Math.PI/2,0,0]},s.createElement("meshBasicMaterial",{transparent:!0,map:j.texture,opacity:r,depthWrite:f})),s.createElement("orthographicCamera",{ref:w,args:[-i/2,i/2,n/2,-n/2,l,o]}))}),ev=({onClose:e})=>(0,i.jsx)("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8",children:(0,i.jsxs)("div",{className:"bg-slate-900 w-full h-full max-w-6xl max-h-[80vh] rounded-2xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden relative",children:[(0,i.jsxs)("div",{className:"px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50",children:[(0,i.jsxs)("div",{children:[(0,i.jsxs)("h2",{className:"text-xl font-bold text-white flex items-center gap-2",children:[(0,i.jsx)("span",{className:"bg-blue-600 px-2 py-0.5 rounded text-sm",children:"AR"}),"3D Інструкція: Кухонна стільниця (Замовлення #81-162)"]}),(0,i.jsx)("p",{className:"text-slate-400 text-sm mt-1",children:"Ділянка: Фаска. Завдання: Зняти фаску 45° по передньому краю."})]}),(0,i.jsx)("button",{onClick:e,className:"text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-10 h-10 rounded-full flex items-center justify-center transition-colors",children:"✕"})]}),(0,i.jsxs)("div",{className:"flex-1 relative bg-gradient-to-b from-slate-900 to-slate-800",children:[(0,i.jsxs)(L.Canvas,{shadows:!0,camera:{position:[2,1.5,3],fov:45},children:[(0,i.jsx)("color",{attach:"background",args:["#0f172a"]}),(0,i.jsx)("ambientLight",{intensity:1.5}),(0,i.jsx)("spotLight",{position:[5,5,5],angle:.15,penumbra:1,intensity:2,castShadow:!0}),(0,i.jsx)("pointLight",{position:[-5,5,-5],intensity:1,color:"#38bdf8"}),(0,i.jsxs)(s.Suspense,{fallback:(0,i.jsx)(ef.Html,{center:!0,children:(0,i.jsx)("div",{className:"text-white",children:"Завантаження 3D моделі..."})}),children:[(0,i.jsxs)("group",{position:[0,-.2,0],children:[(0,i.jsxs)("mesh",{castShadow:!0,receiveShadow:!0,children:[(0,i.jsx)("boxGeometry",{args:[2.5,.05,1.2]}),(0,i.jsx)("meshStandardMaterial",{color:"#e2e8f0",roughness:.2,metalness:.1}),(0,i.jsx)(eu,{scale:1.001,threshold:15,color:"#ef4444"})]}),(0,i.jsx)(eb,{}),(0,i.jsx)(ef.Html,{position:[0,.05,.6],center:!0,children:(0,i.jsxs)("div",{className:"flex flex-col items-center",children:[(0,i.jsx)("div",{className:"w-1 h-8 bg-red-500 mb-1 opacity-80"}),(0,i.jsx)("div",{className:"bg-red-900/90 border border-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap shadow-[0_0_15px_rgba(239,68,68,0.5)]",children:"Фаска 45° (Лицьова сторона)"})]})}),(0,i.jsx)(ef.Html,{position:[-1.25,.05,0],center:!0,children:(0,i.jsx)("div",{className:"bg-slate-800/80 border border-slate-600 text-slate-300 px-2 py-1 rounded text-xs whitespace-nowrap",children:"Лівий торець (Не чіпати)"})}),(0,i.jsx)(ef.Html,{position:[1,.1,-.4],center:!0,children:(0,i.jsxs)("div",{className:"bg-amber-900/90 border border-amber-500 text-amber-200 px-3 py-2 rounded-lg text-xs whitespace-nowrap max-w-[200px] text-center",children:["⚠️ Коментар технолога:",(0,i.jsx)("br",{}),"Кварцит дуже крихкий, починайте фрезерування на малих обертах!"]})})]}),(0,i.jsx)(ep,{position:[0,-.5,0],opacity:.4,scale:5,blur:2,far:2}),(0,i.jsx)(k.OrbitControls,{makeDefault:!0,minPolarAngle:0,maxPolarAngle:Math.PI/1.5,enablePan:!1})]})]}),(0,i.jsxs)("div",{className:"absolute bottom-6 left-6 flex gap-3",children:[(0,i.jsx)("button",{className:"bg-slate-800/80 hover:bg-slate-700 text-white px-4 py-2 rounded border border-slate-600 backdrop-blur text-sm transition-colors",children:"🔄 Перезапустити анімацію"}),(0,i.jsx)("button",{className:"bg-slate-800/80 hover:bg-slate-700 text-white px-4 py-2 rounded border border-slate-600 backdrop-blur text-sm transition-colors",children:"📐 Показати креслення"})]}),(0,i.jsx)("div",{className:"absolute bottom-6 right-6",children:(0,i.jsx)("button",{onClick:e,className:"bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-bold shadow-[0_0_15px_rgba(22,163,74,0.4)] transition-all",children:"Я зрозумів, почати обробку"})})]})]})}),eb=()=>{let e=(0,s.useRef)(null);return(0,ex.useFrame)(t=>{if(!e.current)return;let r=1.25*Math.sin(.5*t.clock.getElapsedTime());e.current.position.x=r}),(0,i.jsxs)("mesh",{ref:e,position:[0,.025,.6],children:[(0,i.jsx)("sphereGeometry",{args:[.03,16,16]}),(0,i.jsx)("meshBasicMaterial",{color:"#38bdf8"}),(0,i.jsx)("pointLight",{color:"#38bdf8",intensity:2,distance:.5})]})},eg=e=>{let[t,r]=(0,s.useState)(1200),n=(0,s.useRef)(null);return(0,s.useEffect)(()=>{if(!n.current)return;let e=new ResizeObserver(e=>r(e[0].contentRect.width));return e.observe(n.current),()=>e.disconnect()},[]),(0,i.jsx)("div",{ref:n,className:"w-full h-full",children:(0,i.jsx)(x.ResponsiveGridLayout,{width:t,...e})})};function ey({user:e,machine:t,onLogout:r,onChangeMachine:a}){let[l,o]=(0,s.useState)([]),[d,c]=(0,s.useState)(!0),[u,x]=(0,s.useState)(!1),m=async()=>{c(!0),o(await n.api.getTasks(t.id)),c(!1)};(0,s.useEffect)(()=>{m();let e=setInterval(m,1e4);return()=>clearInterval(e)},[t.id]);let p=l.find(e=>"in_progress"===e.status),v=l.filter(e=>"in_progress"!==e.status),b=async e=>{await n.api.scanBarcode(e,t.id)?await m():alert("Не вдалося взяти в роботу.")},g=async()=>{if(!p)return;let e=prompt("Виконання завершено! Введіть назву наступного буфера (напр. 'Буфер Шліфування'):","Буфер Шліфування");null!==e&&((await n.api.finishOperation(p.barcode,e)).success?await m():alert("Помилка завершення завдання."))},w=async e=>{let r=await n.api.scanBarcode(e,t.id);return r.success&&await m(),r.success},S=[{i:"scanner",x:0,y:0,w:8,h:2},{i:"active_task",x:0,y:2,w:8,h:6},{i:"queue",x:8,y:0,w:4,h:8}];if(t.dashboard_layout)try{let e=JSON.parse(t.dashboard_layout);Array.isArray(e)&&e.length>0&&("object"==typeof e[0]?S=e:"string"==typeof e[0]&&(S=e.map((e,t)=>({i:e,x:4*t%12,y:4*Math.floor(4*t/12),w:4,h:4}))))}catch(e){console.error("Invalid dashboard_layout JSON:",e)}return(0,i.jsxs)("div",{className:"flex flex-col h-screen w-full bg-black text-white",children:[(0,i.jsxs)("header",{className:"flex items-center justify-between p-6 bg-zinc-900 border-b border-zinc-800 shrink-0",children:[(0,i.jsxs)("div",{className:"flex items-center gap-6",children:[(0,i.jsx)("button",{onClick:a,className:"text-2xl font-bold hover:text-blue-400 transition-colors",children:t.name}),(0,i.jsx)("div",{className:"h-8 w-px bg-zinc-700"}),(0,i.jsxs)("div",{className:"flex items-center gap-2 text-zinc-400",children:[(0,i.jsx)("span",{className:"font-medium text-white",children:e.name}),(0,i.jsx)("span",{className:"px-2 py-0.5 rounded text-xs bg-zinc-800 ml-2",children:e.role})]})]}),(0,i.jsx)("div",{className:"flex items-center gap-4",children:(0,i.jsx)("button",{onClick:m,className:"p-3 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors",children:(0,i.jsx)(f,{size:20})})})]}),(0,i.jsx)("main",{className:"flex-1 overflow-y-auto overflow-x-hidden p-6 custom-scrollbar",children:(0,i.jsx)(eg,{className:"layout",layouts:{lg:S},breakpoints:{lg:1200,md:996,sm:768,xs:480,xxs:0},cols:{lg:12,md:10,sm:6,xs:4,xxs:2},rowHeight:60,isDraggable:!1,isResizable:!1,margin:[24,24],children:S.map(r=>(0,i.jsx)("div",{className:"h-full w-full",children:(r=>{switch(r){case"scanner":return(0,i.jsx)(h,{onScan:w},"scanner");case"active_task":return(0,i.jsx)(y,{currentTask:p,onComplete:g,onOpenInstruction:()=>x(!0)},"active_task");case"queue":return(0,i.jsx)(j,{queue:v,isLoading:d,onTakeTask:b},"queue");case"drawing":return(0,i.jsx)(N,{currentTask:p},"drawing");case"defect":return(0,i.jsx)(M,{currentTask:p,machine:t,user:e,onDefectReported:m},"defect");case"reclamation":return(0,i.jsx)(D,{currentTask:p,machine:t,user:e,onReclamationReported:m},"reclamation");default:return null}})(r.i)},r.i))})}),u&&(0,i.jsx)(ev,{onClose:()=>x(!1)})]})}function ew(){let{user:e}=(0,a.useAuth)(),[t,r]=(0,s.useState)(null),[l,o]=(0,s.useState)([]),[d,c]=(0,s.useState)(!1);(0,s.useEffect)(()=>{let e=localStorage.getItem("mesMachine");if(e)try{r(JSON.parse(e))}catch{}else f()},[]);let f=async()=>{c(!0),o(await n.api.getMachines()),c(!1)},x=async t=>{e&&await n.api.setMachineOperator(t.id,e.name),r(t),localStorage.setItem("mesMachine",JSON.stringify(t))},m=async()=>{r(null),localStorage.removeItem("mesMachine"),await f()};return e?t?(0,i.jsx)("div",{className:"flex-1 overflow-hidden",children:(0,i.jsx)(ey,{user:e,machine:t,onLogout:()=>{},onChangeMachine:m})}):(0,i.jsxs)("div",{className:"flex-1 flex flex-col items-center justify-center p-6 bg-grid",children:[(0,i.jsx)(u,{machines:l,onSelect:x,isLoading:d}),(0,i.jsx)("button",{onClick:f,className:"mt-6 text-slate-500 hover:text-cyan-400 transition-colors text-sm",children:"Оновити список верстатів"})]}):null}e.s(["default",0,function(){return(0,i.jsx)(a.AuthGuard,{children:(0,i.jsxs)("div",{className:"flex h-screen w-screen overflow-hidden",children:[(0,i.jsx)(l.Sidebar,{}),(0,i.jsx)("main",{className:"flex-1 overflow-y-auto",children:(0,i.jsx)(ew,{})})]})})}],52683)}]);