export interface TreeNode {
  id: string
  name: string
  relativePath: string
  type: 'file' | 'folder'
  children?: TreeNode[]
  mtime?: number
  birthtime?: number
  size?: number
}

export interface DeletedNote {
  trashId: string
  name: string
  deletedAt: number
}
