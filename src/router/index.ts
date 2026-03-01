import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { title: '三维地图' },
    },
    {
      path: '/map2d',
      name: 'map2d',
      component: () => import('@/views/Map2DView.vue'),
      meta: { title: '二维地图' },
    },
  ],
})

router.beforeEach((to) => {
  const title = to.meta.title as string | undefined
  if (title) {
    document.title = `${title} - Vue3 + Cesium`
  }
})

export default router
