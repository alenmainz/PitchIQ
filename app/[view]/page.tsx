import Workspace from '../workspace';
export default async function Page({params}:{params:Promise<{view:string}>}){const {view}=await params;return <Workspace initialView={view}/>}
