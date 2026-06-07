export type Category = 'Modèle' | 'Framework' | 'Recherche'

export interface NewsItem {
  id: string
  created_at: string
  title: string
  category: Category
  summary: string
  code_example: string
  source_url: string
}
